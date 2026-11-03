/* 011 - RF-05 Cupones y promociones.
   Decisiones: monto minimo = subtotal del carrito (IVA incluido, antes del descuento); fechas de vigencia en UTC;
   un solo cupon por pedido; el descuento se prorratea por linea y NUNCA excede la base elegible (total >= 0). */
USE ShopCart;
GO

/* Descuento por linea. Base elegible = todo el carrito, o solo las lineas de la categoria del cupon.
   Prorrateo a 2 decimales; el residuo de redondeo se asigna a la linea elegible mas grande, de modo que
   SUM(DescuentoLinea) sea exactamente el descuento total (sin errores de centavos). @IDCupon NULL => sin descuento. */
CREATE FUNCTION FU_Cupones_CalculoDescuento (@IDCarrito INT, @IDCupon INT)
RETURNS TABLE
AS RETURN
WITH Lineas AS (
    SELECT d.IDVariante,
           CAST(v.Precio * d.Cantidad AS DECIMAL(18,2)) AS BaseLinea,
           CASE WHEN c.IDCupon IS NOT NULL AND (c.IDCategoria IS NULL OR p.IDCategoria = c.IDCategoria) THEN 1 ELSE 0 END AS Elegible
      FROM CarritoDetalle d
      JOIN Variante v ON v.IDVariante = d.IDVariante
      JOIN Producto p ON p.IDProducto = v.IDProducto
      LEFT JOIN Cupon c ON c.IDCupon = @IDCupon
     WHERE d.IDCarrito = @IDCarrito
),
Base AS (
    SELECT ISNULL(SUM(CASE WHEN Elegible = 1 THEN BaseLinea ELSE 0 END), 0) AS BaseElegible FROM Lineas
),
Dto AS (
    SELECT b.BaseElegible,
           CASE WHEN c.IDCupon IS NULL THEN CAST(0 AS DECIMAL(18,2))
                WHEN c.Tipo = 'Porcentaje' THEN
                     CASE WHEN ROUND(b.BaseElegible * c.Valor / 100, 2) > b.BaseElegible THEN b.BaseElegible
                          ELSE CAST(ROUND(b.BaseElegible * c.Valor / 100, 2) AS DECIMAL(18,2)) END
                ELSE CASE WHEN c.Valor > b.BaseElegible THEN b.BaseElegible ELSE c.Valor END
           END AS DescTotal
      FROM Base b
      LEFT JOIN Cupon c ON c.IDCupon = @IDCupon
),
Rep AS (
    SELECT l.IDVariante, l.BaseLinea, l.Elegible, x.DescTotal,
           CASE WHEN l.Elegible = 1 AND x.BaseElegible > 0
                THEN CAST(ROUND(x.DescTotal * l.BaseLinea / x.BaseElegible, 2) AS DECIMAL(18,2)) ELSE CAST(0 AS DECIMAL(18,2)) END AS Prorrata,
           ROW_NUMBER() OVER (PARTITION BY l.Elegible ORDER BY l.BaseLinea DESC, l.IDVariante) AS Pos
      FROM Lineas l CROSS JOIN Dto x
)
SELECT r.IDVariante, r.BaseLinea,
       CAST(r.Prorrata + CASE WHEN r.Elegible = 1 AND r.Pos = 1
                              THEN r.DescTotal - SUM(r.Prorrata) OVER (PARTITION BY r.Elegible) ELSE 0 END AS DECIMAL(18,2)) AS DescuentoLinea
  FROM Rep r;
GO

/* Interno. Valida un cupon contra un carrito SIN lanzar error: @Mensaje queda NULL si es valido,
   o con el motivo especifico del rechazo. Lo usan Aplicar (soft), Obtener (aviso) y CrearPedido (bajo bloqueo). */
CREATE PROCEDURE SP_Cupones_Validar
    @IDCupon   INT,
    @IDCarrito INT,
    @IDUsuario INT = NULL,
    @Mensaje   NVARCHAR(300) = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Ahora DATETIME2(0) = SYSUTCDATETIME(), @Activo BIT, @Ini DATETIME2(0), @Fin DATETIME2(0), @Min DECIMAL(18,2),
            @LimT INT, @LimC INT, @Usos INT, @IDCat INT, @Subtotal DECIMAL(18,2), @UsosCliente INT;
    SET @Mensaje = NULL;

    SELECT @Activo = Activo, @Ini = FechaInicio, @Fin = FechaFin, @Min = MontoMinimo, @LimT = LimiteUsosTotal,
           @LimC = LimiteUsosPorCliente, @Usos = UsosActuales, @IDCat = IDCategoria
      FROM Cupon WHERE IDCupon = @IDCupon;

    IF @Activo IS NULL BEGIN SET @Mensaje = N'El cupon no existe.'; RETURN; END
    IF @Activo = 0     BEGIN SET @Mensaje = N'El cupon esta inactivo.'; RETURN; END
    IF @Ahora < @Ini   BEGIN SET @Mensaje = N'El cupon aun no esta vigente.'; RETURN; END
    IF @Ahora > @Fin   BEGIN SET @Mensaje = N'El cupon esta vencido.'; RETURN; END
    IF @Usos >= @LimT  BEGIN SET @Mensaje = N'El cupon esta agotado.'; RETURN; END

    IF @IDUsuario IS NOT NULL
    BEGIN
        SELECT @UsosCliente = COUNT(*) FROM CuponUso WHERE IDCupon = @IDCupon AND IDUsuario = @IDUsuario AND Anulado = 0;
        IF @UsosCliente >= @LimC BEGIN SET @Mensaje = N'Ya alcanzo el limite de usos permitido para este cupon.'; RETURN; END
    END

    SELECT @Subtotal = ISNULL(SUM(v.Precio * d.Cantidad), 0)
      FROM CarritoDetalle d JOIN Variante v ON v.IDVariante = d.IDVariante WHERE d.IDCarrito = @IDCarrito;
    IF @Subtotal < @Min
    BEGIN SET @Mensaje = CONCAT(N'El monto minimo de compra para este cupon es Q', CONVERT(NVARCHAR(20), @Min), N'.'); RETURN; END

    IF @IDCat IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM CarritoDetalle d JOIN Variante v ON v.IDVariante = d.IDVariante JOIN Producto p ON p.IDProducto = v.IDProducto
          WHERE d.IDCarrito = @IDCarrito AND p.IDCategoria = @IDCat)
    BEGIN SET @Mensaje = N'El cupon no aplica a ningun producto del carrito.'; RETURN; END
END;
GO

/* ---------------- CRUD (Administrador) ---------------- */
CREATE PROCEDURE SP_Cupones_Crear
    @Codigo NVARCHAR(30), @Tipo VARCHAR(12), @Valor DECIMAL(18,2), @MontoMinimo DECIMAL(18,2) = 0,
    @FechaInicio DATETIME2(0), @FechaFin DATETIME2(0), @LimiteUsosTotal INT, @LimiteUsosPorCliente INT,
    @IDCategoria INT = NULL, @IDUsuario INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @CodigoN NVARCHAR(30) = UPPER(LTRIM(RTRIM(@Codigo))), @ID INT, @Nuevo NVARCHAR(MAX);
    IF LEN(@CodigoN) < 3 THROW 50012, N'El codigo debe tener al menos 3 caracteres.', 1;
    BEGIN TRY
        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM Cupon WHERE Codigo = @CodigoN) THROW 50011, N'Ya existe un cupon con ese codigo.', 1;
        IF @IDCategoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM Categoria WHERE IDCategoria = @IDCategoria)
            THROW 50012, N'La categoria indicada no existe.', 1;
        INSERT INTO Cupon (Codigo, Tipo, Valor, MontoMinimo, FechaInicio, FechaFin, LimiteUsosTotal, LimiteUsosPorCliente, IDCategoria)
        VALUES (@CodigoN, @Tipo, @Valor, @MontoMinimo, @FechaInicio, @FechaFin, @LimiteUsosTotal, @LimiteUsosPorCliente, @IDCategoria);
        SET @ID = SCOPE_IDENTITY();
        SET @Nuevo = (SELECT * FROM Cupon WHERE IDCupon = @ID FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Cupones', 'Cupon', @ID, 'Creacion', NULL, @Nuevo, @IDUsuario;
        COMMIT;
        SELECT * FROM Cupon WHERE IDCupon = @ID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) THROW 50011, N'Ya existe un cupon con ese codigo.', 1;
        IF ERROR_NUMBER() = 547 THROW 50012, N'Los datos del cupon no cumplen las reglas (tipo, valor, fechas o limites).', 1;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Cupones_Actualizar
    @IDCupon INT, @Codigo NVARCHAR(30), @Tipo VARCHAR(12), @Valor DECIMAL(18,2), @MontoMinimo DECIMAL(18,2) = 0,
    @FechaInicio DATETIME2(0), @FechaFin DATETIME2(0), @LimiteUsosTotal INT, @LimiteUsosPorCliente INT,
    @IDCategoria INT = NULL, @Activo BIT, @IDUsuario INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @CodigoN NVARCHAR(30) = UPPER(LTRIM(RTRIM(@Codigo))), @Ant NVARCHAR(MAX), @Nue NVARCHAR(MAX), @ActivoAnt BIT, @Accion VARCHAR(15);
    BEGIN TRY
        BEGIN TRAN;
        SELECT @ActivoAnt = Activo, @Ant = (SELECT IDCupon, Codigo, Tipo, Valor, MontoMinimo, FechaInicio, FechaFin, LimiteUsosTotal,
                                                   LimiteUsosPorCliente, UsosActuales, IDCategoria, Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
          FROM Cupon WITH (UPDLOCK, ROWLOCK) WHERE IDCupon = @IDCupon;
        IF @ActivoAnt IS NULL THROW 50010, N'Cupon no encontrado.', 1;
        IF EXISTS (SELECT 1 FROM Cupon WHERE Codigo = @CodigoN AND IDCupon <> @IDCupon) THROW 50011, N'Ya existe un cupon con ese codigo.', 1;
        IF @IDCategoria IS NOT NULL AND NOT EXISTS (SELECT 1 FROM Categoria WHERE IDCategoria = @IDCategoria)
            THROW 50012, N'La categoria indicada no existe.', 1;

        UPDATE Cupon SET Codigo = @CodigoN, Tipo = @Tipo, Valor = @Valor, MontoMinimo = @MontoMinimo, FechaInicio = @FechaInicio,
               FechaFin = @FechaFin, LimiteUsosTotal = @LimiteUsosTotal, LimiteUsosPorCliente = @LimiteUsosPorCliente,
               IDCategoria = @IDCategoria, Activo = @Activo
         WHERE IDCupon = @IDCupon;

        SET @Nue = (SELECT IDCupon, Codigo, Tipo, Valor, MontoMinimo, FechaInicio, FechaFin, LimiteUsosTotal,
                           LimiteUsosPorCliente, UsosActuales, IDCategoria, Activo FROM Cupon WHERE IDCupon = @IDCupon FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        SET @Accion = CASE WHEN @ActivoAnt = 1 AND @Activo = 0 THEN 'Desactivacion' ELSE 'Modificacion' END;
        EXEC SP_Bitacora_Registrar 'Cupones', 'Cupon', @IDCupon, @Accion, @Ant, @Nue, @IDUsuario;
        COMMIT;
        SELECT * FROM Cupon WHERE IDCupon = @IDCupon;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) THROW 50011, N'Ya existe un cupon con ese codigo.', 1;
        IF ERROR_NUMBER() = 547 THROW 50012, N'Los datos del cupon no cumplen las reglas (valor, fechas o limites; el limite total no puede ser menor a los usos actuales).', 1;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Cupones_CambiarEstado
    @IDCupon INT, @Activo BIT, @IDUsuario INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Anterior BIT, @Ant NVARCHAR(MAX), @Nue NVARCHAR(MAX), @Accion VARCHAR(15);
    BEGIN TRY
        BEGIN TRAN;
        SELECT @Anterior = Activo FROM Cupon WITH (UPDLOCK, ROWLOCK) WHERE IDCupon = @IDCupon;
        IF @Anterior IS NULL THROW 50010, N'Cupon no encontrado.', 1;
        IF @Anterior <> @Activo
        BEGIN
            SET @Ant = (SELECT @Anterior AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            SET @Nue = (SELECT @Activo AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            SET @Accion = CASE WHEN @Activo = 0 THEN 'Desactivacion' ELSE 'Modificacion' END;
            UPDATE Cupon SET Activo = @Activo WHERE IDCupon = @IDCupon;
            EXEC SP_Bitacora_Registrar 'Cupones', 'Cupon', @IDCupon, @Accion, @Ant, @Nue, @IDUsuario;
        END
        COMMIT;
        SELECT IDCupon, Codigo, Activo FROM Cupon WHERE IDCupon = @IDCupon;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Cupones_ObtenerPorID
    @IDCupon INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT c.*, cat.Nombre AS NombreCategoria FROM Cupon c LEFT JOIN Categoria cat ON cat.IDCategoria = c.IDCategoria WHERE c.IDCupon = @IDCupon;
    IF @@ROWCOUNT = 0 THROW 50010, N'Cupon no encontrado.', 1;
END;
GO

CREATE PROCEDURE SP_Cupones_Listar
    @Busqueda NVARCHAR(30) = NULL, @Activo BIT = NULL, @SoloVigentes BIT = 0, @Pagina INT = 1, @TamanoPagina INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @Pagina IS NULL OR @Pagina < 1 SET @Pagina = 1;
    IF @TamanoPagina IS NULL OR @TamanoPagina < 1 SET @TamanoPagina = 20;
    IF @TamanoPagina > 100 SET @TamanoPagina = 100;
    DECLARE @Patron NVARCHAR(70) = NULL, @Ahora DATETIME2(0) = SYSUTCDATETIME();
    IF @Busqueda IS NOT NULL AND LEN(LTRIM(RTRIM(@Busqueda))) > 0
        SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Busqueda)), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%';

    SELECT c.IDCupon, c.Codigo, c.Tipo, c.Valor, c.MontoMinimo, c.FechaInicio, c.FechaFin, c.LimiteUsosTotal, c.LimiteUsosPorCliente,
           c.UsosActuales, c.IDCategoria, cat.Nombre AS NombreCategoria, c.Activo, COUNT(*) OVER() AS TotalRegistros
      FROM Cupon c LEFT JOIN Categoria cat ON cat.IDCategoria = c.IDCategoria
     WHERE (@Patron IS NULL OR c.Codigo LIKE @Patron)
       AND (@Activo IS NULL OR c.Activo = @Activo)
       AND (@SoloVigentes = 0 OR (c.Activo = 1 AND @Ahora BETWEEN c.FechaInicio AND c.FechaFin AND c.UsosActuales < c.LimiteUsosTotal))
     ORDER BY c.IDCupon DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

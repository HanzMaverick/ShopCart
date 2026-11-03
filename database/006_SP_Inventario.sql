/* 006 - RF-03 Inventario y kardex.
   Existencia disponible = ExistenciaFisica - ExistenciaReservada.
   Todo cambio de ExistenciaFisica pasa por SP_Inventario_RegistrarMovimiento, que actualiza la variante y escribe
   el kardex en la misma transaccion => SUM(Kardex.Cantidad) siempre coincide con ExistenciaFisica. */
USE ShopCart;
GO

CREATE VIEW VW_Inventario_Existencias AS
SELECT v.IDVariante, v.SKU, v.Atributos, v.IDProducto, p.Nombre AS NombreProducto,
       p.IDCategoria, c.Nombre AS NombreCategoria, v.Precio,
       v.ExistenciaFisica, v.ExistenciaReservada,
       v.ExistenciaFisica - v.ExistenciaReservada AS ExistenciaDisponible,
       v.Activa AS VarianteActiva, p.Activo AS ProductoActivo
FROM Variante v
JOIN Producto p  ON p.IDProducto  = v.IDProducto
JOIN Categoria c ON c.IDCategoria = p.IDCategoria;
GO

CREATE VIEW VW_Inventario_ConciliacionKardex AS   -- Diferencia debe ser 0 en todas las filas
SELECT v.IDVariante, v.SKU, v.ExistenciaFisica,
       ISNULL(k.SumaKardex, 0) AS SumaKardex,
       v.ExistenciaFisica - ISNULL(k.SumaKardex, 0) AS Diferencia
FROM Variante v
LEFT JOIN (SELECT IDVariante, SUM(Cantidad) AS SumaKardex FROM Kardex GROUP BY IDVariante) k ON k.IDVariante = v.IDVariante;
GO

CREATE PROCEDURE SP_Inventario_RegistrarMovimiento   -- interno: lo usan otros SPs (ajustes, checkout, devoluciones)
    @IDVariante         INT,
    @TipoMovimiento     VARCHAR(10),
    @Cantidad           INT,                -- con signo
    @Motivo             NVARCHAR(300),
    @IDUsuario          INT,
    @IDPedido           INT = NULL,
    @ExistenciaAnterior INT = NULL OUTPUT,
    @ExistenciaNueva    INT = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @Cantidad = 0 THROW 50012, N'La cantidad no puede ser cero.', 1;
    IF LEN(LTRIM(RTRIM(ISNULL(@Motivo, N'')))) = 0 THROW 50012, N'El motivo es obligatorio.', 1;

    DECLARE @Propia BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END;
    BEGIN TRY
        IF @Propia = 1 BEGIN TRAN;

        -- UPDATE atomico: toma el bloqueo de fila, valida y devuelve la existencia resultante
        UPDATE Variante
           SET @ExistenciaNueva = ExistenciaFisica = ExistenciaFisica + @Cantidad
         WHERE IDVariante = @IDVariante AND ExistenciaFisica + @Cantidad >= 0;

        IF @@ROWCOUNT = 0
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM Variante WHERE IDVariante = @IDVariante) THROW 50010, N'Variante no encontrada.', 1;
            THROW 50012, N'Existencia insuficiente: la operacion dejaria la existencia en negativo.', 1;
        END
        SET @ExistenciaAnterior = @ExistenciaNueva - @Cantidad;

        INSERT INTO Kardex (IDVariante, TipoMovimiento, Cantidad, ExistenciaResultante, Motivo, IDUsuario, IDPedido)
        VALUES (@IDVariante, @TipoMovimiento, @Cantidad, @ExistenciaNueva, LTRIM(RTRIM(@Motivo)), @IDUsuario, @IDPedido);

        IF @Propia = 1 COMMIT;
    END TRY
    BEGIN CATCH
        IF @Propia = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() = 547 AND ERROR_MESSAGE() LIKE N'%CK_Variante_Reservada%'
            THROW 50012, N'La existencia no puede quedar por debajo de las unidades reservadas.', 1;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Inventario_RegistrarEntrada      -- entrada por compra
    @IDVariante INT,
    @Cantidad   INT,
    @Motivo     NVARCHAR(300),
    @IDUsuario  INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @Cantidad IS NULL OR @Cantidad <= 0 THROW 50012, N'La cantidad de una entrada debe ser mayor a cero.', 1;
    DECLARE @Ant INT, @Nue INT, @JAnt NVARCHAR(MAX), @JNue NVARCHAR(MAX);
    BEGIN TRY
        BEGIN TRAN;
        EXEC SP_Inventario_RegistrarMovimiento @IDVariante = @IDVariante, @TipoMovimiento = 'Entrada', @Cantidad = @Cantidad,
             @Motivo = @Motivo, @IDUsuario = @IDUsuario, @ExistenciaAnterior = @Ant OUTPUT, @ExistenciaNueva = @Nue OUTPUT;
        SET @JAnt = (SELECT @Ant AS ExistenciaFisica FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        SET @JNue = (SELECT @Nue AS ExistenciaFisica FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Inventario', 'Variante', @IDVariante, 'Modificacion', @JAnt, @JNue, @IDUsuario;
        COMMIT;
        SELECT IDVariante, SKU, ExistenciaFisica, ExistenciaReservada, ExistenciaDisponible
        FROM VW_Inventario_Existencias WHERE IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Inventario_Ajustar               -- ajuste manual (+/-), exige motivo, nunca deja existencia negativa
    @IDVariante INT,
    @Cantidad   INT,
    @Motivo     NVARCHAR(300),
    @IDUsuario  INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @Cantidad IS NULL OR @Cantidad = 0 THROW 50012, N'La cantidad del ajuste no puede ser cero.', 1;
    DECLARE @Ant INT, @Nue INT, @JAnt NVARCHAR(MAX), @JNue NVARCHAR(MAX);
    BEGIN TRY
        BEGIN TRAN;
        EXEC SP_Inventario_RegistrarMovimiento @IDVariante = @IDVariante, @TipoMovimiento = 'Ajuste', @Cantidad = @Cantidad,
             @Motivo = @Motivo, @IDUsuario = @IDUsuario, @ExistenciaAnterior = @Ant OUTPUT, @ExistenciaNueva = @Nue OUTPUT;
        SET @JAnt = (SELECT @Ant AS ExistenciaFisica FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        SET @JNue = (SELECT @Nue AS ExistenciaFisica FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Inventario', 'Variante', @IDVariante, 'Modificacion', @JAnt, @JNue, @IDUsuario;
        COMMIT;
        SELECT IDVariante, SKU, ExistenciaFisica, ExistenciaReservada, ExistenciaDisponible
        FROM VW_Inventario_Existencias WHERE IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Inventario_Listar
    @Texto         NVARCHAR(100) = NULL,
    @IDCategoria   INT = NULL,
    @UmbralBajo    INT = NULL,                -- solo variantes con disponible <= umbral
    @Pagina        INT = 1,
    @TamanoPagina  INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @Pagina IS NULL OR @Pagina < 1 SET @Pagina = 1;
    IF @TamanoPagina IS NULL OR @TamanoPagina < 1 SET @TamanoPagina = 20;
    IF @TamanoPagina > 100 SET @TamanoPagina = 100;
    DECLARE @Patron NVARCHAR(210) = NULL;
    IF @Texto IS NOT NULL AND LEN(LTRIM(RTRIM(@Texto))) > 0
        SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Texto)), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%';

    SELECT e.IDVariante, e.SKU, e.Atributos, e.IDProducto, e.NombreProducto, e.NombreCategoria,
           e.ExistenciaFisica, e.ExistenciaReservada, e.ExistenciaDisponible, e.VarianteActiva,
           COUNT(*) OVER() AS TotalRegistros
    FROM VW_Inventario_Existencias e
    WHERE (@Patron IS NULL OR e.SKU LIKE @Patron OR e.NombreProducto LIKE @Patron)
      AND (@IDCategoria IS NULL OR e.IDCategoria = @IDCategoria)
      AND (@UmbralBajo IS NULL OR e.ExistenciaDisponible <= @UmbralBajo)
    ORDER BY e.NombreProducto, e.SKU
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

CREATE PROCEDURE SP_Inventario_ObtenerKardex
    @IDVariante     INT,
    @TipoMovimiento VARCHAR(10) = NULL,
    @FechaDesde     DATETIME2(3) = NULL,
    @FechaHasta     DATETIME2(3) = NULL,      -- exclusivo
    @Pagina         INT = 1,
    @TamanoPagina   INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @Pagina IS NULL OR @Pagina < 1 SET @Pagina = 1;
    IF @TamanoPagina IS NULL OR @TamanoPagina < 1 SET @TamanoPagina = 20;
    IF @TamanoPagina > 100 SET @TamanoPagina = 100;
    IF NOT EXISTS (SELECT 1 FROM Variante WHERE IDVariante = @IDVariante) THROW 50010, N'Variante no encontrada.', 1;

    SELECT k.IDKardex, k.TipoMovimiento, k.Cantidad, k.ExistenciaResultante, k.Motivo, k.IDPedido,
           k.IDUsuario, u.Nombre AS NombreUsuario, k.Fecha, COUNT(*) OVER() AS TotalRegistros
    FROM Kardex k
    JOIN Usuario u ON u.IDUsuario = k.IDUsuario
    WHERE k.IDVariante = @IDVariante
      AND (@TipoMovimiento IS NULL OR k.TipoMovimiento = @TipoMovimiento)
      AND (@FechaDesde IS NULL OR k.Fecha >= @FechaDesde)
      AND (@FechaHasta IS NULL OR k.Fecha <  @FechaHasta)
    ORDER BY k.IDKardex DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

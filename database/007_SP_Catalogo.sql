/* 007 - RF-02 Catalogo: categorias, productos, variantes e imagenes.
   Regla: producto con ventas/movimientos/carritos NO se elimina fisicamente; se desactiva y deja de mostrarse en la tienda.
   Un cambio de precio solo afecta a compras futuras: PedidoDetalle guarda el precio congelado. */
USE ShopCart;
GO

/* ===================== Categorias ===================== */
CREATE PROCEDURE SP_Categorias_Crear
    @Nombre      NVARCHAR(100),
    @Descripcion NVARCHAR(500) = NULL,
    @IDUsuario   INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @ID INT, @Nuevo NVARCHAR(MAX);
    BEGIN TRY
        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM Categoria WHERE Nombre = LTRIM(RTRIM(@Nombre))) THROW 50011, N'Ya existe una categoria con ese nombre.', 1;
        INSERT INTO Categoria (Nombre, Descripcion) VALUES (LTRIM(RTRIM(@Nombre)), @Descripcion);
        SET @ID = SCOPE_IDENTITY();
        SET @Nuevo = (SELECT IDCategoria, Nombre, Descripcion, Activa FROM Categoria WHERE IDCategoria = @ID FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Catalogo', 'Categoria', @ID, 'Creacion', NULL, @Nuevo, @IDUsuario;
        COMMIT;
        SELECT IDCategoria, Nombre, Descripcion, Activa FROM Categoria WHERE IDCategoria = @ID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) THROW 50011, N'Ya existe una categoria con ese nombre.', 1;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Categorias_Actualizar
    @IDCategoria INT,
    @Nombre      NVARCHAR(100),
    @Descripcion NVARCHAR(500) = NULL,
    @Activa      BIT,
    @IDUsuario   INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Ant NVARCHAR(MAX), @Nue NVARCHAR(MAX), @ActivaAnt BIT, @Accion VARCHAR(15);
    BEGIN TRY
        BEGIN TRAN;
        SELECT @ActivaAnt = Activa,
               @Ant = (SELECT IDCategoria, Nombre, Descripcion, Activa FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM Categoria WITH (UPDLOCK, ROWLOCK) WHERE IDCategoria = @IDCategoria;
        IF @ActivaAnt IS NULL THROW 50010, N'Categoria no encontrada.', 1;
        IF EXISTS (SELECT 1 FROM Categoria WHERE Nombre = LTRIM(RTRIM(@Nombre)) AND IDCategoria <> @IDCategoria)
            THROW 50011, N'Ya existe una categoria con ese nombre.', 1;

        UPDATE Categoria SET Nombre = LTRIM(RTRIM(@Nombre)), Descripcion = @Descripcion, Activa = @Activa WHERE IDCategoria = @IDCategoria;
        SET @Nue = (SELECT IDCategoria, Nombre, Descripcion, Activa FROM Categoria WHERE IDCategoria = @IDCategoria FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        SET @Accion = CASE WHEN @ActivaAnt = 1 AND @Activa = 0 THEN 'Desactivacion' ELSE 'Modificacion' END;
        EXEC SP_Bitacora_Registrar 'Catalogo', 'Categoria', @IDCategoria, @Accion, @Ant, @Nue, @IDUsuario;
        COMMIT;
        SELECT IDCategoria, Nombre, Descripcion, Activa FROM Categoria WHERE IDCategoria = @IDCategoria;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) THROW 50011, N'Ya existe una categoria con ese nombre.', 1;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Categorias_Eliminar
    @IDCategoria INT,
    @IDUsuario   INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Ant NVARCHAR(MAX);
    BEGIN TRY
        BEGIN TRAN;
        SELECT @Ant = (SELECT IDCategoria, Nombre, Descripcion, Activa FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM Categoria WITH (UPDLOCK, ROWLOCK) WHERE IDCategoria = @IDCategoria;
        IF @Ant IS NULL THROW 50010, N'Categoria no encontrada.', 1;
        IF EXISTS (SELECT 1 FROM Producto WHERE IDCategoria = @IDCategoria) OR EXISTS (SELECT 1 FROM Cupon WHERE IDCategoria = @IDCategoria)
            THROW 50011, N'La categoria tiene productos o cupones asociados. Desactivela en lugar de eliminarla.', 1;
        DELETE FROM Categoria WHERE IDCategoria = @IDCategoria;
        EXEC SP_Bitacora_Registrar 'Catalogo', 'Categoria', @IDCategoria, 'Eliminacion', @Ant, NULL, @IDUsuario;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Categorias_Listar
    @SoloActivas BIT = 0
AS
BEGIN
    SET NOCOUNT ON;
    SELECT c.IDCategoria, c.Nombre, c.Descripcion, c.Activa, COUNT(p.IDProducto) AS TotalProductos
    FROM Categoria c
    LEFT JOIN Producto p ON p.IDCategoria = c.IDCategoria
    WHERE @SoloActivas = 0 OR c.Activa = 1
    GROUP BY c.IDCategoria, c.Nombre, c.Descripcion, c.Activa
    ORDER BY c.Nombre;
END;
GO

/* ===================== Productos ===================== */
CREATE PROCEDURE SP_Productos_Crear
    @IDCategoria INT,
    @Nombre      NVARCHAR(200),
    @Descripcion NVARCHAR(2000) = NULL,
    @IDUsuario   INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @ID INT, @Nuevo NVARCHAR(MAX);
    BEGIN TRY
        BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM Categoria WHERE IDCategoria = @IDCategoria AND Activa = 1)
            THROW 50012, N'La categoria no existe o esta inactiva.', 1;
        INSERT INTO Producto (IDCategoria, Nombre, Descripcion) VALUES (@IDCategoria, LTRIM(RTRIM(@Nombre)), @Descripcion);
        SET @ID = SCOPE_IDENTITY();
        SET @Nuevo = (SELECT IDProducto, IDCategoria, Nombre, Descripcion, Activo FROM Producto WHERE IDProducto = @ID FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Catalogo', 'Producto', @ID, 'Creacion', NULL, @Nuevo, @IDUsuario;
        COMMIT;
        SELECT IDProducto, IDCategoria, Nombre, Descripcion, Activo FROM Producto WHERE IDProducto = @ID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Productos_Actualizar
    @IDProducto  INT,
    @IDCategoria INT,
    @Nombre      NVARCHAR(200),
    @Descripcion NVARCHAR(2000) = NULL,
    @IDUsuario   INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Ant NVARCHAR(MAX), @Nue NVARCHAR(MAX);
    BEGIN TRY
        BEGIN TRAN;
        SELECT @Ant = (SELECT IDProducto, IDCategoria, Nombre, Descripcion, Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto;
        IF @Ant IS NULL THROW 50010, N'Producto no encontrado.', 1;
        IF NOT EXISTS (SELECT 1 FROM Categoria WHERE IDCategoria = @IDCategoria AND Activa = 1)
            THROW 50012, N'La categoria no existe o esta inactiva.', 1;
        UPDATE Producto SET IDCategoria = @IDCategoria, Nombre = LTRIM(RTRIM(@Nombre)), Descripcion = @Descripcion WHERE IDProducto = @IDProducto;
        SET @Nue = (SELECT IDProducto, IDCategoria, Nombre, Descripcion, Activo FROM Producto WHERE IDProducto = @IDProducto FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Catalogo', 'Producto', @IDProducto, 'Modificacion', @Ant, @Nue, @IDUsuario;
        COMMIT;
        SELECT IDProducto, IDCategoria, Nombre, Descripcion, Activo FROM Producto WHERE IDProducto = @IDProducto;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Productos_CambiarEstado
    @IDProducto INT,
    @Activo     BIT,
    @IDUsuario  INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Anterior BIT, @Ant NVARCHAR(MAX), @Nue NVARCHAR(MAX), @Accion VARCHAR(15);
    BEGIN TRY
        BEGIN TRAN;
        SELECT @Anterior = Activo FROM Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto;
        IF @Anterior IS NULL THROW 50010, N'Producto no encontrado.', 1;
        IF @Anterior <> @Activo
        BEGIN
            SET @Ant = (SELECT @Anterior AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            SET @Nue = (SELECT @Activo   AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            SET @Accion = CASE WHEN @Activo = 0 THEN 'Desactivacion' ELSE 'Modificacion' END;
            UPDATE Producto SET Activo = @Activo WHERE IDProducto = @IDProducto;
            EXEC SP_Bitacora_Registrar 'Catalogo', 'Producto', @IDProducto, @Accion, @Ant, @Nue, @IDUsuario;
        END
        COMMIT;
        SELECT IDProducto, Activo FROM Producto WHERE IDProducto = @IDProducto;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Productos_Eliminar      -- fisico solo si no hay historial; si lo hay, se desactiva
    @IDProducto INT,
    @IDUsuario  INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Ant NVARCHAR(MAX), @TieneHistorial BIT = 0, @Resultado VARCHAR(12);
    BEGIN TRY
        BEGIN TRAN;
        SELECT @Ant = (SELECT IDProducto, IDCategoria, Nombre, Descripcion, Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM Producto WITH (UPDLOCK, ROWLOCK) WHERE IDProducto = @IDProducto;
        IF @Ant IS NULL THROW 50010, N'Producto no encontrado.', 1;

        IF EXISTS (SELECT 1 FROM PedidoDetalle  x JOIN Variante v ON v.IDVariante = x.IDVariante WHERE v.IDProducto = @IDProducto)
        OR EXISTS (SELECT 1 FROM Kardex         x JOIN Variante v ON v.IDVariante = x.IDVariante WHERE v.IDProducto = @IDProducto)
        OR EXISTS (SELECT 1 FROM CarritoDetalle x JOIN Variante v ON v.IDVariante = x.IDVariante WHERE v.IDProducto = @IDProducto)
        OR EXISTS (SELECT 1 FROM Reserva        x JOIN Variante v ON v.IDVariante = x.IDVariante WHERE v.IDProducto = @IDProducto)
            SET @TieneHistorial = 1;

        IF @TieneHistorial = 1
        BEGIN
            UPDATE Producto SET Activo = 0 WHERE IDProducto = @IDProducto;
            EXEC SP_Bitacora_Registrar 'Catalogo', 'Producto', @IDProducto, 'Desactivacion', @Ant,
                 N'{"Activo":false}', @IDUsuario;
            SET @Resultado = 'Desactivado';
        END
        ELSE
        BEGIN
            DELETE FROM ImagenProducto WHERE IDProducto = @IDProducto;
            DELETE FROM Variante       WHERE IDProducto = @IDProducto;
            DELETE FROM Producto       WHERE IDProducto = @IDProducto;
            EXEC SP_Bitacora_Registrar 'Catalogo', 'Producto', @IDProducto, 'Eliminacion', @Ant, NULL, @IDUsuario;
            SET @Resultado = 'Eliminado';
        END
        COMMIT;
        SELECT @Resultado AS Resultado;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Productos_ObtenerPorID   -- 3 recordsets: producto, variantes, imagenes
    @IDProducto  INT,
    @SoloActivos BIT = 1                      -- 1 = vista de tienda (cliente)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT p.IDProducto, p.IDCategoria, c.Nombre AS NombreCategoria, p.Nombre, p.Descripcion, p.Activo, p.FechaCreacion
    FROM Producto p JOIN Categoria c ON c.IDCategoria = p.IDCategoria
    WHERE p.IDProducto = @IDProducto AND (@SoloActivos = 0 OR (p.Activo = 1 AND c.Activa = 1));
    IF @@ROWCOUNT = 0 THROW 50010, N'Producto no encontrado.', 1;

    SELECT v.IDVariante, v.SKU, v.Atributos, v.Precio,
           v.ExistenciaFisica - v.ExistenciaReservada AS ExistenciaDisponible, v.Activa
    FROM Variante v
    WHERE v.IDProducto = @IDProducto AND (@SoloActivos = 0 OR v.Activa = 1)
    ORDER BY v.SKU;

    SELECT i.IDImagenProducto, i.Url, i.Orden
    FROM ImagenProducto i WHERE i.IDProducto = @IDProducto ORDER BY i.Orden, i.IDImagenProducto;
END;
GO

CREATE PROCEDURE SP_Productos_Buscar
    @Texto           NVARCHAR(100) = NULL,
    @IDCategoria     INT = NULL,
    @PrecioMin       DECIMAL(18,2) = NULL,
    @PrecioMax       DECIMAL(18,2) = NULL,
    @SoloDisponibles BIT = 0,
    @SoloActivos     BIT = 1,                  -- tienda = 1, administracion = 0
    @OrdenarPor      VARCHAR(10) = 'Recientes', -- Nombre | Precio | Recientes
    @Direccion       VARCHAR(4) = 'DESC',       -- ASC | DESC
    @Pagina          INT = 1,
    @TamanoPagina    INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @Pagina IS NULL OR @Pagina < 1 SET @Pagina = 1;
    IF @TamanoPagina IS NULL OR @TamanoPagina < 1 SET @TamanoPagina = 20;
    IF @TamanoPagina > 100 SET @TamanoPagina = 100;
    IF @OrdenarPor IS NULL OR @OrdenarPor NOT IN ('Nombre', 'Precio', 'Recientes') SET @OrdenarPor = 'Recientes';
    IF @Direccion IS NULL OR @Direccion NOT IN ('ASC', 'DESC') SET @Direccion = 'DESC';

    DECLARE @Patron NVARCHAR(210) = NULL;       -- escapa comodines para que el texto se busque literal
    IF @Texto IS NOT NULL AND LEN(LTRIM(RTRIM(@Texto))) > 0
        SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Texto)), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%';

    ;WITH Agg AS (
        SELECT v.IDProducto, MIN(v.Precio) AS PrecioMin, MAX(v.Precio) AS PrecioMax,
               SUM(v.ExistenciaFisica - v.ExistenciaReservada) AS Disponible
        FROM Variante v WHERE v.Activa = 1 GROUP BY v.IDProducto
    )
    SELECT p.IDProducto, p.Nombre, p.IDCategoria, c.Nombre AS NombreCategoria, p.Activo,
           a.PrecioMin, a.PrecioMax, ISNULL(a.Disponible, 0) AS ExistenciaDisponible,
           img.Url AS ImagenUrl, COUNT(*) OVER() AS TotalRegistros
    FROM Producto p
    JOIN Categoria c ON c.IDCategoria = p.IDCategoria
    LEFT JOIN Agg a  ON a.IDProducto  = p.IDProducto
    OUTER APPLY (SELECT TOP (1) i.Url FROM ImagenProducto i WHERE i.IDProducto = p.IDProducto ORDER BY i.Orden, i.IDImagenProducto) img
    WHERE (@SoloActivos = 0 OR (p.Activo = 1 AND c.Activa = 1 AND a.IDProducto IS NOT NULL))
      AND (@IDCategoria IS NULL OR p.IDCategoria = @IDCategoria)
      AND (@PrecioMin IS NULL OR a.PrecioMax >= @PrecioMin)
      AND (@PrecioMax IS NULL OR a.PrecioMin <= @PrecioMax)
      AND (@SoloDisponibles = 0 OR a.Disponible > 0)
      AND (@Patron IS NULL OR p.Nombre LIKE @Patron OR p.Descripcion LIKE @Patron
           OR EXISTS (SELECT 1 FROM Variante vs WHERE vs.IDProducto = p.IDProducto AND vs.SKU LIKE @Patron))
    ORDER BY
        CASE WHEN @OrdenarPor = 'Nombre'    AND @Direccion = 'ASC'  THEN p.Nombre        END ASC,
        CASE WHEN @OrdenarPor = 'Nombre'    AND @Direccion = 'DESC' THEN p.Nombre        END DESC,
        CASE WHEN @OrdenarPor = 'Precio'    AND @Direccion = 'ASC'  THEN a.PrecioMin     END ASC,
        CASE WHEN @OrdenarPor = 'Precio'    AND @Direccion = 'DESC' THEN a.PrecioMin     END DESC,
        CASE WHEN @OrdenarPor = 'Recientes' AND @Direccion = 'ASC'  THEN p.FechaCreacion END ASC,
        CASE WHEN @OrdenarPor = 'Recientes' AND @Direccion = 'DESC' THEN p.FechaCreacion END DESC,
        p.IDProducto
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

/* ===================== Imagenes ===================== */
CREATE PROCEDURE SP_ImagenesProducto_Agregar
    @IDProducto INT,
    @Url        NVARCHAR(500),
    @Orden      TINYINT = 0
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM Producto WHERE IDProducto = @IDProducto) THROW 50010, N'Producto no encontrado.', 1;
    INSERT INTO ImagenProducto (IDProducto, Url, Orden) VALUES (@IDProducto, @Url, @Orden);
    SELECT IDImagenProducto, IDProducto, Url, Orden FROM ImagenProducto WHERE IDImagenProducto = SCOPE_IDENTITY();
END;
GO

CREATE PROCEDURE SP_ImagenesProducto_Eliminar
    @IDImagenProducto INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM ImagenProducto WHERE IDImagenProducto = @IDImagenProducto;
    IF @@ROWCOUNT = 0 THROW 50010, N'Imagen no encontrada.', 1;
END;
GO

/* ===================== Variantes ===================== */
CREATE PROCEDURE SP_Variantes_Crear
    @IDProducto        INT,
    @SKU               NVARCHAR(50),
    @Atributos         NVARCHAR(500) = N'{}',
    @Precio            DECIMAL(18,2),
    @ExistenciaInicial INT = 0,
    @IDUsuario         INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @SKUN NVARCHAR(50) = UPPER(LTRIM(RTRIM(@SKU))), @ID INT, @Nuevo NVARCHAR(MAX);
    IF ISNULL(ISJSON(@Atributos), 0) <> 1 THROW 50012, N'Los atributos deben ser un JSON valido.', 1;
    IF @Precio IS NULL OR @Precio <= 0 THROW 50012, N'El precio debe ser mayor a cero.', 1;
    IF @ExistenciaInicial IS NULL OR @ExistenciaInicial < 0 THROW 50012, N'La existencia inicial no puede ser negativa.', 1;
    BEGIN TRY
        BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM Producto WHERE IDProducto = @IDProducto) THROW 50010, N'Producto no encontrado.', 1;
        IF EXISTS (SELECT 1 FROM Variante WHERE SKU = @SKUN) THROW 50011, N'El SKU ya existe.', 1;

        INSERT INTO Variante (IDProducto, SKU, Atributos, Precio) VALUES (@IDProducto, @SKUN, @Atributos, @Precio);
        SET @ID = SCOPE_IDENTITY();

        IF @ExistenciaInicial > 0
            EXEC SP_Inventario_RegistrarMovimiento @IDVariante = @ID, @TipoMovimiento = 'Entrada', @Cantidad = @ExistenciaInicial,
                 @Motivo = N'Existencia inicial', @IDUsuario = @IDUsuario;

        SET @Nuevo = (SELECT IDVariante, IDProducto, SKU, Atributos, Precio, ExistenciaFisica, Activa FROM Variante WHERE IDVariante = @ID FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Catalogo', 'Variante', @ID, 'Creacion', NULL, @Nuevo, @IDUsuario;
        COMMIT;
        SELECT IDVariante, IDProducto, SKU, Atributos, Precio, ExistenciaDisponible, VarianteActiva AS Activa
        FROM VW_Inventario_Existencias WHERE IDVariante = @ID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) THROW 50011, N'El SKU ya existe.', 1;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Variantes_Actualizar     -- SKU y atributos. Precio y existencia tienen SPs propios (auditoria separada)
    @IDVariante INT,
    @SKU        NVARCHAR(50),
    @Atributos  NVARCHAR(500),
    @IDUsuario  INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @SKUN NVARCHAR(50) = UPPER(LTRIM(RTRIM(@SKU))), @Ant NVARCHAR(MAX), @Nue NVARCHAR(MAX);
    IF ISNULL(ISJSON(@Atributos), 0) <> 1 THROW 50012, N'Los atributos deben ser un JSON valido.', 1;
    BEGIN TRY
        BEGIN TRAN;
        SELECT @Ant = (SELECT IDVariante, SKU, Atributos FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
        FROM Variante WITH (UPDLOCK, ROWLOCK) WHERE IDVariante = @IDVariante;
        IF @Ant IS NULL THROW 50010, N'Variante no encontrada.', 1;
        IF EXISTS (SELECT 1 FROM Variante WHERE SKU = @SKUN AND IDVariante <> @IDVariante) THROW 50011, N'El SKU ya existe.', 1;
        UPDATE Variante SET SKU = @SKUN, Atributos = @Atributos WHERE IDVariante = @IDVariante;
        SET @Nue = (SELECT IDVariante, SKU, Atributos FROM Variante WHERE IDVariante = @IDVariante FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Catalogo', 'Variante', @IDVariante, 'Modificacion', @Ant, @Nue, @IDUsuario;
        COMMIT;
        SELECT IDVariante, IDProducto, SKU, Atributos, Precio, Activa FROM Variante WHERE IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) THROW 50011, N'El SKU ya existe.', 1;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Variantes_CambiarPrecio
    @IDVariante  INT,
    @PrecioNuevo DECIMAL(18,2),
    @IDUsuario   INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @PrecioNuevo IS NULL OR @PrecioNuevo <= 0 THROW 50012, N'El precio debe ser mayor a cero.', 1;
    DECLARE @PrecioAnt DECIMAL(18,2), @SKU NVARCHAR(50), @Ant NVARCHAR(MAX), @Nue NVARCHAR(MAX);
    BEGIN TRY
        BEGIN TRAN;
        SELECT @PrecioAnt = Precio, @SKU = SKU FROM Variante WITH (UPDLOCK, ROWLOCK) WHERE IDVariante = @IDVariante;
        IF @SKU IS NULL THROW 50010, N'Variante no encontrada.', 1;
        IF @PrecioAnt <> @PrecioNuevo
        BEGIN
            SET @Ant = (SELECT @SKU AS SKU, @PrecioAnt  AS Precio FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            SET @Nue = (SELECT @SKU AS SKU, @PrecioNuevo AS Precio FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            UPDATE Variante SET Precio = @PrecioNuevo WHERE IDVariante = @IDVariante;
            EXEC SP_Bitacora_Registrar 'Precios', 'Variante', @IDVariante, 'Modificacion', @Ant, @Nue, @IDUsuario;
        END
        COMMIT;
        SELECT IDVariante, SKU, Precio FROM Variante WHERE IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Variantes_CambiarEstado
    @IDVariante INT,
    @Activa     BIT,
    @IDUsuario  INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Anterior BIT, @Ant NVARCHAR(MAX), @Nue NVARCHAR(MAX), @Accion VARCHAR(15);
    BEGIN TRY
        BEGIN TRAN;
        SELECT @Anterior = Activa FROM Variante WITH (UPDLOCK, ROWLOCK) WHERE IDVariante = @IDVariante;
        IF @Anterior IS NULL THROW 50010, N'Variante no encontrada.', 1;
        IF @Anterior <> @Activa
        BEGIN
            SET @Ant = (SELECT @Anterior AS Activa FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            SET @Nue = (SELECT @Activa   AS Activa FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            SET @Accion = CASE WHEN @Activa = 0 THEN 'Desactivacion' ELSE 'Modificacion' END;
            UPDATE Variante SET Activa = @Activa WHERE IDVariante = @IDVariante;
            EXEC SP_Bitacora_Registrar 'Catalogo', 'Variante', @IDVariante, @Accion, @Ant, @Nue, @IDUsuario;
        END
        COMMIT;
        SELECT IDVariante, SKU, Activa FROM Variante WHERE IDVariante = @IDVariante;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* 012 - RF-04 Carrito y direcciones de entrega.
   SEGURIDAD (RF-01): ningun SP recibe un IDCarrito del cliente. El carrito se resuelve SIEMPRE por el dueno
   (@IDUsuario tomado del JWT por el backend, o el token del invitado), asi que no existe forma de tocar el carrito de otro.
   Toda modificacion del carrito libera sus reservas: el checkout debe reiniciarse. */
USE ShopCart;
GO

/* Interno. Encuentra (o crea) el carrito activo del dueno. Solo uno de @IDUsuario / @TokenInvitado.
   Con @Crear = 1 la busqueda usa UPDLOCK + HOLDLOCK (bloqueo de rango sobre el indice unico filtrado): dos peticiones
   simultaneas del mismo dueno se serializan y solo una crea el carrito. Debe llamarse dentro de una transaccion. */
CREATE PROCEDURE SP_Carrito_Resolver
    @IDUsuario     INT = NULL,
    @TokenInvitado UNIQUEIDENTIFIER = NULL,
    @Crear         BIT = 0,
    @IDCarrito     INT = NULL OUTPUT,
    @TokenSalida   UNIQUEIDENTIFIER = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    IF @IDUsuario IS NOT NULL AND @TokenInvitado IS NOT NULL
        THROW 50012, N'Debe indicar el usuario autenticado o el token de invitado, no ambos.', 1;
    SET @IDCarrito = NULL; SET @TokenSalida = @TokenInvitado;

    IF @IDUsuario IS NOT NULL
    BEGIN
        IF @Crear = 1
            SELECT @IDCarrito = IDCarrito FROM Carrito WITH (UPDLOCK, HOLDLOCK) WHERE IDUsuario = @IDUsuario AND Estado = 'Activo';
        ELSE
            SELECT @IDCarrito = IDCarrito FROM Carrito WHERE IDUsuario = @IDUsuario AND Estado = 'Activo';
    END
    ELSE IF @TokenInvitado IS NOT NULL
    BEGIN
        IF @Crear = 1
            SELECT @IDCarrito = IDCarrito FROM Carrito WITH (UPDLOCK, HOLDLOCK) WHERE TokenInvitado = @TokenInvitado AND Estado = 'Activo';
        ELSE
            SELECT @IDCarrito = IDCarrito FROM Carrito WHERE TokenInvitado = @TokenInvitado AND Estado = 'Activo';
    END

    IF @IDCarrito IS NULL AND @Crear = 1
    BEGIN
        IF @IDUsuario IS NULL AND @TokenSalida IS NULL SET @TokenSalida = NEWID();
        INSERT INTO Carrito (IDUsuario, TokenInvitado) VALUES (@IDUsuario, CASE WHEN @IDUsuario IS NULL THEN @TokenSalida END);
        SET @IDCarrito = SCOPE_IDENTITY();
    END
END;
GO

/* Devuelve el carrito completo: recordset 1 = cabecera con totales, recordset 2 = lineas.
   Los precios son los vigentes; el descuento solo se aplica si el cupon sigue siendo valido (si no, CuponAviso explica por que). */
CREATE PROCEDURE SP_Carrito_Obtener
    @IDUsuario     INT = NULL,
    @TokenInvitado UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @IDCarrito INT, @Token UNIQUEIDENTIFIER, @IDCupon INT, @Codigo NVARCHAR(30), @Aviso NVARCHAR(300),
            @Subtotal DECIMAL(18,2) = 0, @Descuento DECIMAL(18,2) = 0, @Items INT = 0, @Expira DATETIME2(3), @CuponAplicado INT;

    EXEC SP_Carrito_Resolver @IDUsuario = @IDUsuario, @TokenInvitado = @TokenInvitado, @Crear = 0,
         @IDCarrito = @IDCarrito OUTPUT, @TokenSalida = @Token OUTPUT;

    IF @IDCarrito IS NOT NULL
    BEGIN
        SELECT @IDCupon = c.IDCupon, @Codigo = c.Codigo FROM Carrito k JOIN Cupon c ON c.IDCupon = k.IDCupon WHERE k.IDCarrito = @IDCarrito;
        IF @IDCupon IS NOT NULL
        BEGIN
            EXEC SP_Cupones_Validar @IDCupon = @IDCupon, @IDCarrito = @IDCarrito, @IDUsuario = @IDUsuario, @Mensaje = @Aviso OUTPUT;
            SET @CuponAplicado = CASE WHEN @Aviso IS NULL THEN @IDCupon END;
        END
        SELECT @Subtotal = ISNULL(SUM(f.BaseLinea), 0), @Descuento = ISNULL(SUM(f.DescuentoLinea), 0)
          FROM FU_Cupones_CalculoDescuento(@IDCarrito, @CuponAplicado) f;
        SELECT @Items = ISNULL(SUM(Cantidad), 0) FROM CarritoDetalle WHERE IDCarrito = @IDCarrito;
        SELECT @Expira = MIN(FechaExpira) FROM Reserva WHERE IDCarrito = @IDCarrito AND Estado = 'Activa' AND FechaExpira > SYSUTCDATETIME();
    END

    SELECT @IDCarrito AS IDCarrito, @Token AS TokenInvitado, @Codigo AS CodigoCupon, @Aviso AS CuponAviso,
           @Subtotal AS Subtotal, @Descuento AS Descuento, @Subtotal - @Descuento AS Total,
           CAST(ROUND((@Subtotal - @Descuento) * 12 / 112, 2) AS DECIMAL(18,2)) AS MontoIVA,
           @Items AS TotalUnidades, @Expira AS ReservaExpira;

    SELECT d.IDVariante, v.SKU, p.Nombre AS NombreProducto, v.Atributos,
           (SELECT TOP (1) i.Url FROM ImagenProducto i WHERE i.IDProducto = p.IDProducto ORDER BY i.Orden, i.IDImagenProducto) AS ImagenUrl,
           v.Precio AS PrecioUnitario, d.Cantidad, f.DescuentoLinea,
           CAST(f.BaseLinea - f.DescuentoLinea AS DECIMAL(18,2)) AS Subtotal,
           v.ExistenciaFisica - v.ExistenciaReservada AS ExistenciaDisponible,
           CASE WHEN v.Activa = 1 AND p.Activo = 1 AND cat.Activa = 1
                 AND d.Cantidad <= v.ExistenciaFisica - v.ExistenciaReservada
                       + ISNULL((SELECT SUM(r.Cantidad) FROM Reserva r WHERE r.IDCarrito = d.IDCarrito AND r.IDVariante = d.IDVariante
                                  AND r.Estado = 'Activa' AND r.FechaExpira > SYSUTCDATETIME()), 0)
                THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS Disponible
      FROM CarritoDetalle d
      JOIN Variante v   ON v.IDVariante  = d.IDVariante
      JOIN Producto p   ON p.IDProducto  = v.IDProducto
      JOIN Categoria cat ON cat.IDCategoria = p.IDCategoria
      JOIN FU_Cupones_CalculoDescuento(@IDCarrito, @CuponAplicado) f ON f.IDVariante = d.IDVariante
     WHERE d.IDCarrito = @IDCarrito
     ORDER BY p.Nombre, v.SKU;
END;
GO

CREATE PROCEDURE SP_Carrito_AgregarItem
    @IDUsuario INT = NULL, @TokenInvitado UNIQUEIDENTIFIER = NULL, @IDVariante INT, @Cantidad INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @Cantidad IS NULL OR @Cantidad < 1 OR @Cantidad > 10000 THROW 50012, N'La cantidad debe estar entre 1 y 10000.', 1;
    DECLARE @IDCarrito INT, @Token UNIQUEIDENTIFIER, @Disp INT, @Actual INT, @Nueva INT, @Msg NVARCHAR(300);
    BEGIN TRY
        BEGIN TRAN;
        EXEC SP_Carrito_Resolver @IDUsuario = @IDUsuario, @TokenInvitado = @TokenInvitado, @Crear = 1,
             @IDCarrito = @IDCarrito OUTPUT, @TokenSalida = @Token OUTPUT;
        EXEC SP_Inventario_LiberarReservasCarrito @IDCarrito = @IDCarrito;

        SELECT @Disp = v.ExistenciaFisica - v.ExistenciaReservada
          FROM Variante v JOIN Producto p ON p.IDProducto = v.IDProducto JOIN Categoria c ON c.IDCategoria = p.IDCategoria
         WHERE v.IDVariante = @IDVariante AND v.Activa = 1 AND p.Activo = 1 AND c.Activa = 1;
        IF @Disp IS NULL THROW 50010, N'El producto no esta disponible.', 1;

        SELECT @Actual = Cantidad FROM CarritoDetalle WITH (UPDLOCK, HOLDLOCK) WHERE IDCarrito = @IDCarrito AND IDVariante = @IDVariante;
        SET @Nueva = ISNULL(@Actual, 0) + @Cantidad;
        IF @Nueva > @Disp
        BEGIN
            SET @Msg = CONCAT(N'La cantidad solicitada excede la existencia disponible (disponible: ', CASE WHEN @Disp < 0 THEN 0 ELSE @Disp END, N'; en su carrito: ', ISNULL(@Actual, 0), N').');
            THROW 50012, @Msg, 1;
        END

        IF @Actual IS NULL INSERT INTO CarritoDetalle (IDCarrito, IDVariante, Cantidad) VALUES (@IDCarrito, @IDVariante, @Nueva);
        ELSE UPDATE CarritoDetalle SET Cantidad = @Nueva WHERE IDCarrito = @IDCarrito AND IDVariante = @IDVariante;
        UPDATE Carrito SET UltimaActividad = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
    EXEC SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitado = @Token;
END;
GO

CREATE PROCEDURE SP_Carrito_ModificarCantidad     -- fija la cantidad absoluta de una linea existente
    @IDUsuario INT = NULL, @TokenInvitado UNIQUEIDENTIFIER = NULL, @IDVariante INT, @Cantidad INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @Cantidad IS NULL OR @Cantidad < 1 OR @Cantidad > 10000 THROW 50012, N'La cantidad debe estar entre 1 y 10000. Para quitar el producto use eliminar.', 1;
    DECLARE @IDCarrito INT, @Token UNIQUEIDENTIFIER, @Disp INT, @Msg NVARCHAR(300);
    BEGIN TRY
        BEGIN TRAN;
        EXEC SP_Carrito_Resolver @IDUsuario = @IDUsuario, @TokenInvitado = @TokenInvitado, @Crear = 0,
             @IDCarrito = @IDCarrito OUTPUT, @TokenSalida = @Token OUTPUT;
        IF @IDCarrito IS NULL OR NOT EXISTS (SELECT 1 FROM CarritoDetalle WHERE IDCarrito = @IDCarrito AND IDVariante = @IDVariante)
            THROW 50010, N'El producto no esta en el carrito.', 1;
        EXEC SP_Inventario_LiberarReservasCarrito @IDCarrito = @IDCarrito;

        SELECT @Disp = v.ExistenciaFisica - v.ExistenciaReservada
          FROM Variante v JOIN Producto p ON p.IDProducto = v.IDProducto JOIN Categoria c ON c.IDCategoria = p.IDCategoria
         WHERE v.IDVariante = @IDVariante AND v.Activa = 1 AND p.Activo = 1 AND c.Activa = 1;
        IF @Disp IS NULL THROW 50012, N'El producto ya no esta disponible. Eliminelo del carrito.', 1;
        IF @Cantidad > @Disp
        BEGIN
            SET @Msg = CONCAT(N'La cantidad solicitada excede la existencia disponible (disponible: ', CASE WHEN @Disp < 0 THEN 0 ELSE @Disp END, N').');
            THROW 50012, @Msg, 1;
        END
        UPDATE CarritoDetalle SET Cantidad = @Cantidad WHERE IDCarrito = @IDCarrito AND IDVariante = @IDVariante;
        UPDATE Carrito SET UltimaActividad = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
    EXEC SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitado = @Token;
END;
GO

CREATE PROCEDURE SP_Carrito_EliminarItem
    @IDUsuario INT = NULL, @TokenInvitado UNIQUEIDENTIFIER = NULL, @IDVariante INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @IDCarrito INT, @Token UNIQUEIDENTIFIER;
    BEGIN TRY
        BEGIN TRAN;
        EXEC SP_Carrito_Resolver @IDUsuario = @IDUsuario, @TokenInvitado = @TokenInvitado, @Crear = 0,
             @IDCarrito = @IDCarrito OUTPUT, @TokenSalida = @Token OUTPUT;
        IF @IDCarrito IS NULL THROW 50010, N'El carrito no existe.', 1;
        EXEC SP_Inventario_LiberarReservasCarrito @IDCarrito = @IDCarrito;
        DELETE FROM CarritoDetalle WHERE IDCarrito = @IDCarrito AND IDVariante = @IDVariante;
        IF @@ROWCOUNT = 0 THROW 50010, N'El producto no esta en el carrito.', 1;
        UPDATE Carrito SET UltimaActividad = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
    EXEC SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitado = @Token;
END;
GO

CREATE PROCEDURE SP_Carrito_Vaciar
    @IDUsuario INT = NULL, @TokenInvitado UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @IDCarrito INT, @Token UNIQUEIDENTIFIER;
    BEGIN TRY
        BEGIN TRAN;
        EXEC SP_Carrito_Resolver @IDUsuario = @IDUsuario, @TokenInvitado = @TokenInvitado, @Crear = 0,
             @IDCarrito = @IDCarrito OUTPUT, @TokenSalida = @Token OUTPUT;
        IF @IDCarrito IS NOT NULL
        BEGIN
            EXEC SP_Inventario_LiberarReservasCarrito @IDCarrito = @IDCarrito;
            DELETE FROM CarritoDetalle WHERE IDCarrito = @IDCarrito;
            UPDATE Carrito SET IDCupon = NULL, UltimaActividad = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        END
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
    EXEC SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitado = @Token;
END;
GO

/* Un solo cupon por carrito: aplicar uno nuevo reemplaza al anterior. Rechazo con mensaje especifico. */
CREATE PROCEDURE SP_Carrito_AplicarCupon
    @IDUsuario INT = NULL, @TokenInvitado UNIQUEIDENTIFIER = NULL, @Codigo NVARCHAR(30)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @IDCarrito INT, @Token UNIQUEIDENTIFIER, @IDCupon INT, @Mensaje NVARCHAR(300);
    BEGIN TRY
        BEGIN TRAN;
        EXEC SP_Carrito_Resolver @IDUsuario = @IDUsuario, @TokenInvitado = @TokenInvitado, @Crear = 0,
             @IDCarrito = @IDCarrito OUTPUT, @TokenSalida = @Token OUTPUT;
        IF @IDCarrito IS NULL OR NOT EXISTS (SELECT 1 FROM CarritoDetalle WHERE IDCarrito = @IDCarrito)
            THROW 50012, N'El carrito esta vacio.', 1;
        SELECT @IDCupon = IDCupon FROM Cupon WHERE Codigo = UPPER(LTRIM(RTRIM(@Codigo)));
        IF @IDCupon IS NULL THROW 50012, N'El cupon no existe.', 1;

        EXEC SP_Cupones_Validar @IDCupon = @IDCupon, @IDCarrito = @IDCarrito, @IDUsuario = @IDUsuario, @Mensaje = @Mensaje OUTPUT;
        IF @Mensaje IS NOT NULL THROW 50012, @Mensaje, 1;

        EXEC SP_Inventario_LiberarReservasCarrito @IDCarrito = @IDCarrito;   -- el total cambia: reiniciar checkout
        UPDATE Carrito SET IDCupon = @IDCupon, UltimaActividad = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
    EXEC SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitado = @Token;
END;
GO

CREATE PROCEDURE SP_Carrito_QuitarCupon
    @IDUsuario INT = NULL, @TokenInvitado UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @IDCarrito INT, @Token UNIQUEIDENTIFIER;
    BEGIN TRY
        BEGIN TRAN;
        EXEC SP_Carrito_Resolver @IDUsuario = @IDUsuario, @TokenInvitado = @TokenInvitado, @Crear = 0,
             @IDCarrito = @IDCarrito OUTPUT, @TokenSalida = @Token OUTPUT;
        IF @IDCarrito IS NOT NULL
        BEGIN
            EXEC SP_Inventario_LiberarReservasCarrito @IDCarrito = @IDCarrito;
            UPDATE Carrito SET IDCupon = NULL, UltimaActividad = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        END
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
    EXEC SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitado = @Token;
END;
GO

/* Al iniciar sesion: pasa las lineas del carrito de invitado al del usuario (limitadas a la existencia disponible). */
CREATE PROCEDURE SP_Carrito_FusionarInvitado
    @IDUsuario INT, @TokenInvitado UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @IDInvitado INT, @IDUser INT, @T1 UNIQUEIDENTIFIER, @T2 UNIQUEIDENTIFIER;
    BEGIN TRY
        BEGIN TRAN;
        EXEC SP_Carrito_Resolver @IDUsuario = NULL, @TokenInvitado = @TokenInvitado, @Crear = 0, @IDCarrito = @IDInvitado OUTPUT, @TokenSalida = @T1 OUTPUT;
        IF @IDInvitado IS NOT NULL AND EXISTS (SELECT 1 FROM CarritoDetalle WHERE IDCarrito = @IDInvitado)
        BEGIN
            EXEC SP_Carrito_Resolver @IDUsuario = @IDUsuario, @TokenInvitado = NULL, @Crear = 1, @IDCarrito = @IDUser OUTPUT, @TokenSalida = @T2 OUTPUT;
            EXEC SP_Inventario_LiberarReservasCarrito @IDCarrito = @IDUser;

            UPDATE u SET u.Cantidad = a.Nueva
              FROM CarritoDetalle u
              JOIN CarritoDetalle g ON g.IDVariante = u.IDVariante AND g.IDCarrito = @IDInvitado
              JOIN Variante v ON v.IDVariante = u.IDVariante
              CROSS APPLY (SELECT CASE WHEN u.Cantidad + g.Cantidad > v.ExistenciaFisica - v.ExistenciaReservada
                                       THEN v.ExistenciaFisica - v.ExistenciaReservada ELSE u.Cantidad + g.Cantidad END AS Nueva) a
             WHERE u.IDCarrito = @IDUser AND a.Nueva > 0;

            INSERT INTO CarritoDetalle (IDCarrito, IDVariante, Cantidad)
            SELECT @IDUser, g.IDVariante,
                   CASE WHEN g.Cantidad > v.ExistenciaFisica - v.ExistenciaReservada THEN v.ExistenciaFisica - v.ExistenciaReservada ELSE g.Cantidad END
              FROM CarritoDetalle g
              JOIN Variante v ON v.IDVariante = g.IDVariante AND v.Activa = 1 AND v.ExistenciaFisica - v.ExistenciaReservada > 0
             WHERE g.IDCarrito = @IDInvitado
               AND NOT EXISTS (SELECT 1 FROM CarritoDetalle u WHERE u.IDCarrito = @IDUser AND u.IDVariante = g.IDVariante);

            DELETE FROM CarritoDetalle WHERE IDCarrito = @IDInvitado;
            UPDATE Carrito SET Estado = 'Convertido' WHERE IDCarrito = @IDInvitado;
            UPDATE Carrito SET UltimaActividad = SYSUTCDATETIME() WHERE IDCarrito = @IDUser;
        END
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
    EXEC SP_Carrito_Obtener @IDUsuario = @IDUsuario, @TokenInvitado = NULL;
END;
GO

/* ===================== Direcciones (siempre del usuario autenticado) ===================== */
CREATE PROCEDURE SP_Direcciones_Listar
    @IDUsuario INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT IDDireccion, Alias, Linea1, Linea2, Ciudad, Departamento, Telefono
      FROM Direccion WHERE IDUsuario = @IDUsuario AND Activa = 1 ORDER BY IDDireccion;
END;
GO

CREATE PROCEDURE SP_Direcciones_Crear
    @IDUsuario INT, @Alias NVARCHAR(50), @Linea1 NVARCHAR(200), @Linea2 NVARCHAR(200) = NULL,
    @Ciudad NVARCHAR(100), @Departamento NVARCHAR(100), @Telefono NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO Direccion (IDUsuario, Alias, Linea1, Linea2, Ciudad, Departamento, Telefono)
    VALUES (@IDUsuario, LTRIM(RTRIM(@Alias)), LTRIM(RTRIM(@Linea1)), @Linea2, LTRIM(RTRIM(@Ciudad)), LTRIM(RTRIM(@Departamento)), LTRIM(RTRIM(@Telefono)));
    SELECT IDDireccion, Alias, Linea1, Linea2, Ciudad, Departamento, Telefono FROM Direccion WHERE IDDireccion = SCOPE_IDENTITY();
END;
GO

CREATE PROCEDURE SP_Direcciones_Actualizar
    @IDUsuario INT, @IDDireccion INT, @Alias NVARCHAR(50), @Linea1 NVARCHAR(200), @Linea2 NVARCHAR(200) = NULL,
    @Ciudad NVARCHAR(100), @Departamento NVARCHAR(100), @Telefono NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Direccion SET Alias = LTRIM(RTRIM(@Alias)), Linea1 = LTRIM(RTRIM(@Linea1)), Linea2 = @Linea2,
           Ciudad = LTRIM(RTRIM(@Ciudad)), Departamento = LTRIM(RTRIM(@Departamento)), Telefono = LTRIM(RTRIM(@Telefono))
     WHERE IDDireccion = @IDDireccion AND IDUsuario = @IDUsuario AND Activa = 1;      -- el filtro por dueno evita tocar direcciones ajenas
    IF @@ROWCOUNT = 0 THROW 50010, N'Direccion no encontrada.', 1;
    SELECT IDDireccion, Alias, Linea1, Linea2, Ciudad, Departamento, Telefono FROM Direccion WHERE IDDireccion = @IDDireccion;
END;
GO

CREATE PROCEDURE SP_Direcciones_Desactivar
    @IDUsuario INT, @IDDireccion INT
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE Direccion SET Activa = 0 WHERE IDDireccion = @IDDireccion AND IDUsuario = @IDUsuario AND Activa = 1;
    IF @@ROWCOUNT = 0 THROW 50010, N'Direccion no encontrada.', 1;
END;
GO

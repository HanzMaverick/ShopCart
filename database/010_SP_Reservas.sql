/* 010 - RF-06 Reserva de existencia (15 min) y su liberacion.
   REGLA DE ORO ANTI-DEADLOCK: toda transaccion que toque varias variantes las bloquea en orden ascendente de IDVariante,
   y dentro de cada variante el orden es siempre Variante -> Reserva. */
USE ShopCart;
GO

/* Interno. Debe correr dentro de una transaccion: libera las reservas vencidas de la variante
   y, opcionalmente, las activas de un carrito (@NuevoEstado = 'Liberada'). */
CREATE PROCEDURE SP_Inventario_LiberarReservaVariante
    @IDVariante        INT,
    @IDCarrito         INT = NULL,
    @NuevoEstado       VARCHAR(10) = 'Liberada',
    @UnidadesLiberadas INT = 0 OUTPUT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @@TRANCOUNT = 0 THROW 50012, N'SP_Inventario_LiberarReservaVariante debe ejecutarse dentro de una transaccion.', 1;

    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Bloqueo INT;
    DECLARE @T TABLE (Cantidad INT NOT NULL);

    SELECT @Bloqueo = IDVariante FROM Variante WITH (UPDLOCK, ROWLOCK) WHERE IDVariante = @IDVariante;

    UPDATE Reserva
       SET Estado = CASE WHEN FechaExpira <= @Ahora THEN 'Vencida' ELSE @NuevoEstado END
    OUTPUT inserted.Cantidad INTO @T
     WHERE IDVariante = @IDVariante AND Estado = 'Activa'
       AND (FechaExpira <= @Ahora OR IDCarrito = @IDCarrito);

    SELECT @UnidadesLiberadas = ISNULL(SUM(Cantidad), 0) FROM @T;
    IF @UnidadesLiberadas > 0
        UPDATE Variante SET ExistenciaReservada = ExistenciaReservada - @UnidadesLiberadas WHERE IDVariante = @IDVariante;
END;
GO

/* Interno. Libera todas las reservas activas de un carrito (el carrito cambio: el checkout debe reiniciarse). */
CREATE PROCEDURE SP_Inventario_LiberarReservasCarrito
    @IDCarrito INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @Propia BIT = CASE WHEN @@TRANCOUNT = 0 THEN 1 ELSE 0 END, @V INT = 0;
    BEGIN TRY
        IF @Propia = 1 BEGIN TRAN;
        WHILE 1 = 1
        BEGIN
            SELECT TOP (1) @V = IDVariante FROM Reserva
             WHERE IDCarrito = @IDCarrito AND Estado = 'Activa' AND IDVariante > @V ORDER BY IDVariante;
            IF @@ROWCOUNT = 0 BREAK;
            EXEC SP_Inventario_LiberarReservaVariante @IDVariante = @V, @IDCarrito = @IDCarrito, @NuevoEstado = 'Liberada';
        END
        IF @Propia = 1 COMMIT;
    END TRY
    BEGIN CATCH
        IF @Propia = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* Tarea periodica (job de Node cada minuto): libera reservas vencidas sin intervencion manual.
   Procesa una variante por transaccion corta, asi nunca retiene dos bloqueos a la vez. */
CREATE PROCEDURE SP_Inventario_LiberarReservasVencidas
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @V INT = 0, @N INT, @Total INT = 0;
    WHILE 1 = 1
    BEGIN
        SELECT TOP (1) @V = IDVariante FROM Reserva
         WHERE Estado = 'Activa' AND FechaExpira <= SYSUTCDATETIME() AND IDVariante > @V ORDER BY IDVariante;
        IF @@ROWCOUNT = 0 BREAK;
        BEGIN TRY
            BEGIN TRAN;
            EXEC SP_Inventario_LiberarReservaVariante @IDVariante = @V, @UnidadesLiberadas = @N OUTPUT;
            COMMIT;
            SET @Total += @N;
        END TRY
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
            THROW;
        END CATCH
    END
    SELECT @Total AS UnidadesLiberadas;
END;
GO

/* "Iniciar pago": reserva TODAS las lineas del carrito del usuario o ninguna.
   El UPDATE condicionado (Fisica - Reservada >= cantidad) es atomico: si dos clientes piden la ultima unidad,
   uno obtiene la fila y el otro recibe el mensaje de existencia insuficiente. El CHECK de Variante es la red de seguridad. */
CREATE PROCEDURE SP_Inventario_ReservarExistencia
    @IDUsuario      INT,
    @MinutosReserva INT = 15
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @MinutosReserva IS NULL OR @MinutosReserva < 1 OR @MinutosReserva > 60
        THROW 50012, N'Los minutos de reserva deben estar entre 1 y 60.', 1;

    DECLARE @IDCarrito INT, @V INT = 0, @Q INT, @Msg NVARCHAR(400), @SKU NVARCHAR(50), @Nombre NVARCHAR(200),
            @Disp INT, @Activa BIT, @Ahora DATETIME2(3) = SYSUTCDATETIME(), @Expira DATETIME2(3);
    SET @Expira = DATEADD(MINUTE, @MinutosReserva, @Ahora);

    BEGIN TRY
        BEGIN TRAN;
        SELECT @IDCarrito = IDCarrito FROM Carrito WITH (UPDLOCK, ROWLOCK) WHERE IDUsuario = @IDUsuario AND Estado = 'Activo';
        IF @IDCarrito IS NULL THROW 50012, N'No hay un carrito activo.', 1;
        IF NOT EXISTS (SELECT 1 FROM CarritoDetalle WHERE IDCarrito = @IDCarrito) THROW 50012, N'El carrito esta vacio.', 1;

        WHILE 1 = 1
        BEGIN
            SELECT TOP (1) @V = d.IDVariante, @Q = d.Cantidad FROM CarritoDetalle d
             WHERE d.IDCarrito = @IDCarrito AND d.IDVariante > @V ORDER BY d.IDVariante;
            IF @@ROWCOUNT = 0 BREAK;

            -- libera vencidas de cualquier carrito y la reserva previa de este (reinicia el cronometro)
            EXEC SP_Inventario_LiberarReservaVariante @IDVariante = @V, @IDCarrito = @IDCarrito, @NuevoEstado = 'Liberada';

            UPDATE v SET ExistenciaReservada = ExistenciaReservada + @Q
              FROM Variante v
              JOIN Producto p  ON p.IDProducto  = v.IDProducto
              JOIN Categoria c ON c.IDCategoria = p.IDCategoria
             WHERE v.IDVariante = @V AND v.Activa = 1 AND p.Activo = 1 AND c.Activa = 1
               AND v.ExistenciaFisica - v.ExistenciaReservada >= @Q;

            IF @@ROWCOUNT = 0
            BEGIN
                SELECT @SKU = v.SKU, @Nombre = p.Nombre, @Disp = v.ExistenciaFisica - v.ExistenciaReservada,
                       @Activa = CASE WHEN v.Activa = 1 AND p.Activo = 1 AND c.Activa = 1 THEN 1 ELSE 0 END
                  FROM Variante v JOIN Producto p ON p.IDProducto = v.IDProducto JOIN Categoria c ON c.IDCategoria = p.IDCategoria
                 WHERE v.IDVariante = @V;
                IF @Activa = 0
                    SET @Msg = CONCAT(N'El producto "', @Nombre, N'" (', @SKU, N') ya no esta disponible.');
                ELSE
                    SET @Msg = CONCAT(N'No hay existencia suficiente de "', @Nombre, N'" (', @SKU, N'). Disponible: ', @Disp, N'.');
                THROW 50012, @Msg, 1;
            END

            INSERT INTO Reserva (IDCarrito, IDVariante, Cantidad, FechaCreacion, FechaExpira)
            VALUES (@IDCarrito, @V, @Q, @Ahora, @Expira);
        END

        UPDATE Carrito SET UltimaActividad = @Ahora WHERE IDCarrito = @IDCarrito;
        COMMIT;

        SELECT @Expira AS FechaExpira, @MinutosReserva AS MinutosReserva;
        SELECT v.SKU, p.Nombre AS NombreProducto, r.Cantidad
          FROM Reserva r JOIN Variante v ON v.IDVariante = r.IDVariante JOIN Producto p ON p.IDProducto = v.IDProducto
         WHERE r.IDCarrito = @IDCarrito AND r.Estado = 'Activa' ORDER BY v.SKU;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

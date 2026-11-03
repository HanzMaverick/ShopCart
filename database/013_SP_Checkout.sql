/* 013 - RF-06 Checkout y pago: SP_Pedidos_CrearPedido.
   Garantias:
   - ATOMICO: pedido, detalle, kardex, uso de cupon, pago y cierre del carrito se guardan juntos o no se guarda nada.
   - IDEMPOTENTE: UNIQUE (IDUsuario, ClaveIdempotencia). Reintento o doble clic => mismo pedido, sin segundo cobro.
   - SIN SOBREVENTA: consume las reservas hechas en SP_Inventario_ReservarExistencia (15 min); no vende lo no reservado.
   - PRECIO CONGELADO: precio y descuento se leen bajo bloqueo de las variantes y quedan copiados en PedidoDetalle.
   - CUPON: se valida y se descuenta el cupo con el cupon bloqueado => el limite total se respeta con concurrencia.
   Orden de bloqueo: Carrito -> Variantes (ascendente) -> Cupon. */
USE ShopCart;
GO

CREATE PROCEDURE SP_Pedidos_CrearPedido
    @IDUsuario         INT,
    @ClaveIdempotencia UNIQUEIDENTIFIER,
    @HashSolicitud     CHAR(64),                 -- SHA-256 del contenido de la solicitud (lo calcula el backend)
    @IDDireccion       INT,
    @MetodoPago        VARCHAR(20),
    @TotalEsperado     DECIMAL(18,2) = NULL      -- total que vio el cliente; si difiere, se rechaza
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @MetodoPago IS NULL OR @MetodoPago NOT IN ('Tarjeta', 'Transferencia', 'Efectivo') THROW 50012, N'Metodo de pago no valido.', 1;

    DECLARE @IDPedido INT, @HashPrevio CHAR(64), @EstadoPrevio VARCHAR(10);
    DECLARE @IDSolicitud BIGINT, @IDCarrito INT, @IDCupon INT, @CodigoCupon NVARCHAR(30), @Mensaje NVARCHAR(300),
            @Direccion NVARCHAR(600), @Telefono NVARCHAR(20), @NumeroPedido NVARCHAR(20),
            @Subtotal DECIMAL(18,2), @Descuento DECIMAL(18,2), @Total DECIMAL(18,2),
            @V INT = 0, @Q INT, @Sku NVARCHAR(50), @Nombre NVARCHAR(200), @Reservado INT, @Vendible BIT,
            @Neg INT, @MotivoKardex NVARCHAR(300), @JNuevo NVARCHAR(MAX), @Num INT, @Msg NVARCHAR(4000);

    -- 1) Reintento de una solicitud ya completada: devuelve el mismo pedido sin tocar nada
    SELECT @IDPedido = IDPedido, @HashPrevio = HashSolicitud, @EstadoPrevio = Estado
      FROM SolicitudPago WHERE IDUsuario = @IDUsuario AND ClaveIdempotencia = @ClaveIdempotencia;
    IF @HashPrevio IS NOT NULL
    BEGIN
        IF @HashPrevio <> @HashSolicitud THROW 50011, N'La clave de idempotencia ya se uso con una solicitud distinta.', 1;
        IF @EstadoPrevio = 'Completada'
        BEGIN
            SELECT p.IDPedido, p.NumeroPedido, CAST(1 AS BIT) AS Repetida FROM Pedido p WHERE p.IDPedido = @IDPedido;
            RETURN;
        END
    END

    DECLARE @L TABLE (IDVariante INT NOT NULL PRIMARY KEY, SKU NVARCHAR(50) NOT NULL, Nombre NVARCHAR(200) NOT NULL,
                      Atributos NVARCHAR(500) NOT NULL, Precio DECIMAL(18,2) NOT NULL, Cantidad INT NOT NULL,
                      BaseLinea DECIMAL(18,2) NOT NULL, Dto DECIMAL(18,2) NOT NULL);

    BEGIN TRY
        BEGIN TRAN;

        -- 2) Registra la solicitud. Si otra identica va en curso, este INSERT espera su resultado (clave unica)
        INSERT INTO SolicitudPago (IDUsuario, ClaveIdempotencia, HashSolicitud) VALUES (@IDUsuario, @ClaveIdempotencia, @HashSolicitud);
        SET @IDSolicitud = SCOPE_IDENTITY();

        -- 3) Carrito del propio usuario
        SELECT @IDCarrito = IDCarrito, @IDCupon = IDCupon FROM Carrito WITH (UPDLOCK, ROWLOCK) WHERE IDUsuario = @IDUsuario AND Estado = 'Activo';
        IF @IDCarrito IS NULL THROW 50012, N'No hay un carrito activo para pagar.', 1;
        IF NOT EXISTS (SELECT 1 FROM CarritoDetalle WHERE IDCarrito = @IDCarrito) THROW 50012, N'El carrito esta vacio.', 1;

        -- 4) Direccion: debe ser del usuario (una ajena responde "no encontrada")
        SELECT @Direccion = LEFT(CONCAT(Linea1, CASE WHEN Linea2 IS NULL THEN N'' ELSE CONCAT(N', ', Linea2) END, N', ', Ciudad, N', ', Departamento), 600),
               @Telefono = Telefono
          FROM Direccion WHERE IDDireccion = @IDDireccion AND IDUsuario = @IDUsuario AND Activa = 1;
        IF @Direccion IS NULL THROW 50010, N'Direccion no encontrada.', 1;

        -- 5) Bloquea las variantes en orden ascendente y verifica que cada linea tenga su reserva vigente
        WHILE 1 = 1
        BEGIN
            SELECT TOP (1) @V = d.IDVariante, @Q = d.Cantidad FROM CarritoDetalle d WHERE d.IDCarrito = @IDCarrito AND d.IDVariante > @V ORDER BY d.IDVariante;
            IF @@ROWCOUNT = 0 BREAK;

            SELECT @Sku = v.SKU, @Nombre = p.Nombre,
                   @Vendible = CASE WHEN v.Activa = 1 AND p.Activo = 1 AND c.Activa = 1 THEN 1 ELSE 0 END
              FROM Variante v WITH (UPDLOCK, ROWLOCK)
              JOIN Producto p ON p.IDProducto = v.IDProducto JOIN Categoria c ON c.IDCategoria = p.IDCategoria
             WHERE v.IDVariante = @V;
            IF @Vendible = 0
            BEGIN
                SET @Msg = CONCAT(N'El producto "', @Nombre, N'" (', @Sku, N') ya no esta disponible. Quitelo del carrito.');
                THROW 50012, @Msg, 1;
            END

            SELECT @Reservado = ISNULL(SUM(Cantidad), 0) FROM Reserva
             WHERE IDCarrito = @IDCarrito AND IDVariante = @V AND Estado = 'Activa' AND FechaExpira > SYSUTCDATETIME();
            IF @Reservado <> @Q THROW 50012, N'La reserva de existencia vencio o no existe. Inicie el pago nuevamente.', 1;
        END

        -- 6) Cupon: se bloquea, se valida con las reglas vigentes y se calcula el descuento prorrateado
        IF @IDCupon IS NOT NULL
        BEGIN
            SELECT @CodigoCupon = Codigo FROM Cupon WITH (UPDLOCK, ROWLOCK) WHERE IDCupon = @IDCupon;
            EXEC SP_Cupones_Validar @IDCupon = @IDCupon, @IDCarrito = @IDCarrito, @IDUsuario = @IDUsuario, @Mensaje = @Mensaje OUTPUT;
            IF @Mensaje IS NOT NULL THROW 50012, @Mensaje, 1;
        END

        INSERT INTO @L (IDVariante, SKU, Nombre, Atributos, Precio, Cantidad, BaseLinea, Dto)
        SELECT v.IDVariante, v.SKU, p.Nombre, v.Atributos, v.Precio, d.Cantidad, f.BaseLinea, f.DescuentoLinea
          FROM CarritoDetalle d
          JOIN Variante v ON v.IDVariante = d.IDVariante
          JOIN Producto p ON p.IDProducto = v.IDProducto
          JOIN FU_Cupones_CalculoDescuento(@IDCarrito, @IDCupon) f ON f.IDVariante = d.IDVariante
         WHERE d.IDCarrito = @IDCarrito;

        SELECT @Subtotal = SUM(BaseLinea), @Descuento = SUM(Dto) FROM @L;
        SET @Total = @Subtotal - @Descuento;

        IF @TotalEsperado IS NOT NULL AND @TotalEsperado <> @Total
            THROW 50011, N'Los precios o descuentos cambiaron desde que reviso su carrito. Revise el nuevo total antes de pagar.', 1;

        -- 7) Pedido y detalle con precio congelado (IVA 12 % incluido en el precio: MontoIVA = Total * 12 / 112)
        INSERT INTO Pedido (IDUsuario, IDEstadoPedido, IDCupon, CodigoCupon, DireccionEnvio, TelefonoContacto, Subtotal, Descuento, Total, MontoIVA)
        VALUES (@IDUsuario, 1, @IDCupon, @CodigoCupon, @Direccion, @Telefono, @Subtotal, @Descuento, @Total, ROUND(@Total * 12 / 112, 2));
        SET @IDPedido = SCOPE_IDENTITY();
        SELECT @NumeroPedido = NumeroPedido FROM Pedido WHERE IDPedido = @IDPedido;

        INSERT INTO PedidoDetalle (IDPedido, IDVariante, SKU, NombreProducto, Atributos, PrecioUnitario, Cantidad, DescuentoLinea, Subtotal)
        SELECT @IDPedido, IDVariante, SKU, Nombre, Atributos, Precio, Cantidad, Dto, BaseLinea - Dto FROM @L;

        -- 8) Consume la reserva y da salida al inventario (kardex) en orden ascendente
        SET @V = 0;
        SET @MotivoKardex = CONCAT(N'Venta pedido ', @NumeroPedido);
        WHILE 1 = 1
        BEGIN
            SELECT TOP (1) @V = IDVariante, @Q = Cantidad FROM @L WHERE IDVariante > @V ORDER BY IDVariante;
            IF @@ROWCOUNT = 0 BREAK;
            SET @Neg = -@Q;
            UPDATE Variante SET ExistenciaReservada = ExistenciaReservada - @Q WHERE IDVariante = @V;
            EXEC SP_Inventario_RegistrarMovimiento @IDVariante = @V, @TipoMovimiento = 'Salida', @Cantidad = @Neg,
                 @Motivo = @MotivoKardex, @IDUsuario = @IDUsuario, @IDPedido = @IDPedido;
        END
        UPDATE Reserva SET Estado = 'Consumida' WHERE IDCarrito = @IDCarrito AND Estado = 'Activa';

        -- 9) Cupon, pago, cierre de carrito, historial y bitacora
        IF @IDCupon IS NOT NULL
        BEGIN
            UPDATE Cupon SET UsosActuales = UsosActuales + 1 WHERE IDCupon = @IDCupon;     -- el CHECK UsosActuales <= LimiteUsosTotal es la red de seguridad
            INSERT INTO CuponUso (IDCupon, IDUsuario, IDPedido) VALUES (@IDCupon, @IDUsuario, @IDPedido);
        END

        INSERT INTO Pago (IDPedido, Metodo, Referencia, Monto, Estado)
        VALUES (@IDPedido, @MetodoPago, CONCAT(N'PAY-', CONVERT(NVARCHAR(36), NEWID())), @Total, 'Aprobado');

        UPDATE Carrito SET Estado = 'Convertido', UltimaActividad = SYSUTCDATETIME() WHERE IDCarrito = @IDCarrito;
        INSERT INTO PedidoHistorialEstado (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Comentario)
        VALUES (@IDPedido, NULL, 1, @IDUsuario, N'Pedido creado y pagado');

        SET @JNuevo = (SELECT @NumeroPedido AS NumeroPedido, 'Pagado' AS Estado, @Subtotal AS Subtotal, @Descuento AS Descuento,
                              @Total AS Total, @CodigoCupon AS CodigoCupon FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Pedidos', 'Pedido', @IDPedido, 'Creacion', NULL, @JNuevo, @IDUsuario;

        UPDATE SolicitudPago SET Estado = 'Completada', IDPedido = @IDPedido WHERE IDSolicitudPago = @IDSolicitud;
        COMMIT;

        SELECT @IDPedido AS IDPedido, @NumeroPedido AS NumeroPedido, CAST(0 AS BIT) AS Repetida;
    END TRY
    BEGIN CATCH
        SET @Num = ERROR_NUMBER(); SET @Msg = ERROR_MESSAGE();
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;

        -- Perdio la carrera contra una solicitud identica: se devuelve el pedido que esa si creo
        IF @Num IN (2601, 2627) AND @Msg LIKE N'%UQ_SolicitudPago_Clave%'
        BEGIN
            SELECT @IDPedido = IDPedido, @HashPrevio = HashSolicitud FROM SolicitudPago WHERE IDUsuario = @IDUsuario AND ClaveIdempotencia = @ClaveIdempotencia;
            IF @HashPrevio IS NOT NULL AND @HashPrevio <> @HashSolicitud THROW 50011, N'La clave de idempotencia ya se uso con una solicitud distinta.', 1;
            IF @IDPedido IS NOT NULL
            BEGIN
                SELECT p.IDPedido, p.NumeroPedido, CAST(1 AS BIT) AS Repetida FROM Pedido p WHERE p.IDPedido = @IDPedido;
                RETURN;
            END
        END;
        THROW;
    END CATCH
END;
GO

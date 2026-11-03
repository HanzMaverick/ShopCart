/* 014 - RF-07 Gestion de pedidos y devoluciones.
   CICLO DE VIDA (tabla TransicionEstadoPedido, validado en SP y en trigger TR_Pedido_ValidarTransicion):
     Pagado -> EnPreparacion -> Despachado -> Entregado -> DevueltoParcial -> DevueltoTotal
     Cancelacion permitida solo desde Pagado y EnPreparacion (antes de despachar). Devolucion solo desde Entregado/DevueltoParcial.
   Cancelar y devolver reintegran existencia con movimientos de kardex y registran un reembolso en Pago. */
USE ShopCart;
GO

CREATE PROCEDURE SP_Pedidos_ListarTransiciones      -- para el diagrama de estados y los botones del Operador
    @IDEstadoOrigen TINYINT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SELECT t.IDEstadoOrigen, o.Nombre AS EstadoOrigen, t.IDEstadoDestino, d.Nombre AS EstadoDestino
      FROM TransicionEstadoPedido t
      JOIN EstadoPedido o ON o.IDEstadoPedido = t.IDEstadoOrigen
      JOIN EstadoPedido d ON d.IDEstadoPedido = t.IDEstadoDestino
     WHERE @IDEstadoOrigen IS NULL OR t.IDEstadoOrigen = @IDEstadoOrigen
     ORDER BY t.IDEstadoOrigen, t.IDEstadoDestino;
END;
GO

/* Detalle completo. @IDUsuarioDueno NULL = vista de personal; con valor = solo si el pedido es suyo (si no, "no encontrado").
   Recordsets: 1 cabecera, 2 lineas, 3 historial de estados, 4 pagos, 5 devoluciones. */
CREATE PROCEDURE SP_Pedidos_ObtenerDetalle
    @IDPedido INT, @IDUsuarioDueno INT = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT EXISTS (SELECT 1 FROM Pedido WHERE IDPedido = @IDPedido AND (@IDUsuarioDueno IS NULL OR IDUsuario = @IDUsuarioDueno))
        THROW 50010, N'Pedido no encontrado.', 1;

    SELECT p.IDPedido, p.NumeroPedido, p.IDUsuario, u.Nombre AS NombreCliente, u.Correo AS CorreoCliente,
           p.IDEstadoPedido, e.Nombre AS Estado, p.CodigoCupon, p.DireccionEnvio, p.TelefonoContacto,
           p.Subtotal, p.Descuento, p.Total, p.MontoIVA, p.FechaCreacion
      FROM Pedido p JOIN Usuario u ON u.IDUsuario = p.IDUsuario JOIN EstadoPedido e ON e.IDEstadoPedido = p.IDEstadoPedido
     WHERE p.IDPedido = @IDPedido;

    SELECT IDPedidoDetalle, IDVariante, SKU, NombreProducto, Atributos, PrecioUnitario, Cantidad, DescuentoLinea, Subtotal,
           CantidadDevuelta, Cantidad - CantidadDevuelta AS CantidadDevolvible
      FROM PedidoDetalle WHERE IDPedido = @IDPedido ORDER BY IDPedidoDetalle;

    SELECT h.IDPedidoHistorialEstado, ea.Nombre AS EstadoAnterior, en.Nombre AS EstadoNuevo, u.Nombre AS NombreUsuario, h.Fecha, h.Comentario
      FROM PedidoHistorialEstado h
      LEFT JOIN EstadoPedido ea ON ea.IDEstadoPedido = h.IDEstadoAnterior
      JOIN EstadoPedido en ON en.IDEstadoPedido = h.IDEstadoNuevo
      JOIN Usuario u ON u.IDUsuario = h.IDUsuario
     WHERE h.IDPedido = @IDPedido ORDER BY h.IDPedidoHistorialEstado;

    SELECT IDPago, Metodo, Referencia, Monto, Estado, Fecha FROM Pago WHERE IDPedido = @IDPedido ORDER BY IDPago;

    SELECT dv.IDDevolucion, dv.Motivo, dv.MontoReembolsado, dv.Fecha, u.Nombre AS NombreUsuario
      FROM Devolucion dv JOIN Usuario u ON u.IDUsuario = dv.IDUsuario WHERE dv.IDPedido = @IDPedido ORDER BY dv.IDDevolucion;
END;
GO

/* Listado con filtros, ordenamiento y paginacion en el servidor. Cliente: el backend fuerza @IDUsuarioDueno. */
CREATE PROCEDURE SP_Pedidos_Listar
    @IDUsuarioDueno INT = NULL, @IDEstadoPedido TINYINT = NULL, @Cliente NVARCHAR(100) = NULL,
    @FechaDesde DATETIME2(3) = NULL, @FechaHasta DATETIME2(3) = NULL,          -- hasta exclusivo
    @OrdenarPor VARCHAR(10) = 'Fecha', @Direccion VARCHAR(4) = 'DESC', @Pagina INT = 1, @TamanoPagina INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @Pagina IS NULL OR @Pagina < 1 SET @Pagina = 1;
    IF @TamanoPagina IS NULL OR @TamanoPagina < 1 SET @TamanoPagina = 20;
    IF @TamanoPagina > 100 SET @TamanoPagina = 100;
    IF @OrdenarPor IS NULL OR @OrdenarPor NOT IN ('Fecha', 'Total', 'Estado', 'Cliente') SET @OrdenarPor = 'Fecha';
    IF @Direccion IS NULL OR @Direccion NOT IN ('ASC', 'DESC') SET @Direccion = 'DESC';
    DECLARE @Patron NVARCHAR(210) = NULL;
    IF @Cliente IS NOT NULL AND LEN(LTRIM(RTRIM(@Cliente))) > 0
        SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Cliente)), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%';

    SELECT p.IDPedido, p.NumeroPedido, p.IDUsuario, u.Nombre AS NombreCliente, u.Correo AS CorreoCliente,
           p.IDEstadoPedido, e.Nombre AS Estado, p.Subtotal, p.Descuento, p.Total, p.FechaCreacion, COUNT(*) OVER() AS TotalRegistros
      FROM Pedido p
      JOIN Usuario u ON u.IDUsuario = p.IDUsuario
      JOIN EstadoPedido e ON e.IDEstadoPedido = p.IDEstadoPedido
     WHERE (@IDUsuarioDueno IS NULL OR p.IDUsuario = @IDUsuarioDueno)
       AND (@IDEstadoPedido IS NULL OR p.IDEstadoPedido = @IDEstadoPedido)
       AND (@Patron IS NULL OR u.Nombre LIKE @Patron OR u.Correo LIKE @Patron)
       AND (@FechaDesde IS NULL OR p.FechaCreacion >= @FechaDesde)
       AND (@FechaHasta IS NULL OR p.FechaCreacion <  @FechaHasta)
     ORDER BY
        CASE WHEN @OrdenarPor = 'Fecha'   AND @Direccion = 'ASC'  THEN p.FechaCreacion END ASC,
        CASE WHEN @OrdenarPor = 'Fecha'   AND @Direccion = 'DESC' THEN p.FechaCreacion END DESC,
        CASE WHEN @OrdenarPor = 'Total'   AND @Direccion = 'ASC'  THEN p.Total END ASC,
        CASE WHEN @OrdenarPor = 'Total'   AND @Direccion = 'DESC' THEN p.Total END DESC,
        CASE WHEN @OrdenarPor = 'Estado'  AND @Direccion = 'ASC'  THEN e.Nombre END ASC,
        CASE WHEN @OrdenarPor = 'Estado'  AND @Direccion = 'DESC' THEN e.Nombre END DESC,
        CASE WHEN @OrdenarPor = 'Cliente' AND @Direccion = 'ASC'  THEN u.Nombre END ASC,
        CASE WHEN @OrdenarPor = 'Cliente' AND @Direccion = 'DESC' THEN u.Nombre END DESC,
        p.IDPedido DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

/* Avanza o cancela un pedido.
   Personal (Operador/Administrador): cualquier transicion valida salvo DevueltoParcial/DevueltoTotal (las fija la devolucion).
   Cliente (@EsCliente = 1): solo sus propios pedidos y solo para cancelar. */
CREATE PROCEDURE SP_Pedidos_CambiarEstado
    @IDPedido INT, @IDEstadoNuevo TINYINT, @IDUsuario INT, @EsCliente BIT = 0, @Comentario NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @EsCliente = 1 AND @IDEstadoNuevo <> 5 THROW 50013, N'Solo puede cancelar su pedido.', 1;
    IF @IDEstadoNuevo IN (6, 7) THROW 50012, N'Los estados de devolucion se establecen al registrar una devolucion.', 1;

    DECLARE @Actual TINYINT, @Dueno INT, @Num NVARCHAR(20), @Total DECIMAL(18,2), @NomA NVARCHAR(30), @NomN NVARCHAR(30), @Msg NVARCHAR(300),
            @V INT = 0, @Q INT, @Motivo NVARCHAR(300), @IDCupon INT, @Metodo VARCHAR(20), @JAnt NVARCHAR(MAX), @JNue NVARCHAR(MAX);
    BEGIN TRY
        BEGIN TRAN;
        SELECT @Actual = IDEstadoPedido, @Dueno = IDUsuario, @Num = NumeroPedido, @Total = Total
          FROM Pedido WITH (UPDLOCK, ROWLOCK) WHERE IDPedido = @IDPedido;
        IF @Actual IS NULL OR (@EsCliente = 1 AND @Dueno <> @IDUsuario) THROW 50010, N'Pedido no encontrado.', 1;

        IF NOT EXISTS (SELECT 1 FROM TransicionEstadoPedido WHERE IDEstadoOrigen = @Actual AND IDEstadoDestino = @IDEstadoNuevo)
        BEGIN
            SELECT @NomA = Nombre FROM EstadoPedido WHERE IDEstadoPedido = @Actual;
            SELECT @NomN = Nombre FROM EstadoPedido WHERE IDEstadoPedido = @IDEstadoNuevo;
            SET @Msg = CONCAT(N'Transicion de estado no permitida: ', @NomA, N' -> ', ISNULL(@NomN, N'desconocido'), N'.');
            THROW 50012, @Msg, 1;
        END

        IF @IDEstadoNuevo = 5      -- Cancelacion: reintegra existencia (variantes en orden ascendente), reembolsa y devuelve el cupo del cupon
        BEGIN
            SET @Motivo = CONCAT(N'Cancelacion pedido ', @Num);
            WHILE 1 = 1
            BEGIN
                SELECT TOP (1) @V = IDVariante, @Q = Cantidad - CantidadDevuelta FROM PedidoDetalle
                 WHERE IDPedido = @IDPedido AND IDVariante > @V ORDER BY IDVariante;
                IF @@ROWCOUNT = 0 BREAK;
                IF @Q > 0
                    EXEC SP_Inventario_RegistrarMovimiento @IDVariante = @V, @TipoMovimiento = 'Devolucion', @Cantidad = @Q,
                         @Motivo = @Motivo, @IDUsuario = @IDUsuario, @IDPedido = @IDPedido;
            END

            SELECT TOP (1) @Metodo = Metodo FROM Pago WHERE IDPedido = @IDPedido AND Estado = 'Aprobado' ORDER BY IDPago;
            IF @Metodo IS NOT NULL
                INSERT INTO Pago (IDPedido, Metodo, Referencia, Monto, Estado)
                VALUES (@IDPedido, @Metodo, CONCAT(N'REF-', CONVERT(NVARCHAR(36), NEWID())), @Total, 'Reembolsado');

            SELECT @IDCupon = IDCupon FROM CuponUso WITH (UPDLOCK) WHERE IDPedido = @IDPedido AND Anulado = 0;
            IF @IDCupon IS NOT NULL
            BEGIN
                UPDATE CuponUso SET Anulado = 1 WHERE IDPedido = @IDPedido;
                UPDATE Cupon SET UsosActuales = UsosActuales - 1 WHERE IDCupon = @IDCupon;
            END
        END

        UPDATE Pedido SET IDEstadoPedido = @IDEstadoNuevo WHERE IDPedido = @IDPedido;     -- el trigger vuelve a validar la transicion
        INSERT INTO PedidoHistorialEstado (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Comentario)
        VALUES (@IDPedido, @Actual, @IDEstadoNuevo, @IDUsuario, @Comentario);

        SELECT @JAnt = (SELECT @Actual AS IDEstadoPedido, e.Nombre AS Estado FROM EstadoPedido e WHERE e.IDEstadoPedido = @Actual FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        SELECT @JNue = (SELECT @IDEstadoNuevo AS IDEstadoPedido, e.Nombre AS Estado FROM EstadoPedido e WHERE e.IDEstadoPedido = @IDEstadoNuevo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Pedidos', 'Pedido', @IDPedido, 'Modificacion', @JAnt, @JNue, @IDUsuario;
        COMMIT;

        SELECT p.IDPedido, p.NumeroPedido, p.IDEstadoPedido, e.Nombre AS Estado
          FROM Pedido p JOIN EstadoPedido e ON e.IDEstadoPedido = p.IDEstadoPedido WHERE p.IDPedido = @IDPedido;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* Devolucion total o parcial por linea. @Lineas = JSON: [{"idPedidoDetalle":1,"cantidad":2}, ...]
   Reglas: solo pedidos Entregados / DevueltoParcial; no se devuelve mas de lo vendido por linea; el reembolso de la ultima
   unidad de una linea completa exactamente su subtotal (sin perder centavos por redondeo). */
CREATE PROCEDURE SP_Devoluciones_Registrar
    @IDPedido INT, @IDUsuario INT, @Motivo NVARCHAR(500), @Lineas NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF LEN(LTRIM(RTRIM(ISNULL(@Motivo, N'')))) = 0 THROW 50012, N'El motivo de la devolucion es obligatorio.', 1;
    IF ISNULL(ISJSON(@Lineas), 0) <> 1 THROW 50012, N'Las lineas de la devolucion deben ser un JSON valido.', 1;

    DECLARE @L TABLE (IDPedidoDetalle INT NOT NULL PRIMARY KEY, Cantidad INT NOT NULL);
    DECLARE @Actual TINYINT, @Nuevo TINYINT, @Num NVARCHAR(20), @IDDev INT, @Metodo VARCHAR(20), @MotivoKardex NVARCHAR(300),
            @IDDet INT, @X INT, @V INT = 0, @CantTot INT, @Sub DECIMAL(18,2), @DevAhora INT, @Previo DECIMAL(18,2), @MontoLinea DECIMAL(18,2),
            @MontoTotal DECIMAL(18,2) = 0, @Sku NVARCHAR(50), @Msg NVARCHAR(300), @JAnt NVARCHAR(MAX), @JNue NVARCHAR(MAX), @NomN NVARCHAR(30);

    BEGIN TRY
        INSERT INTO @L (IDPedidoDetalle, Cantidad)
        SELECT j.IdPedidoDetalle, j.Cantidad FROM OPENJSON(@Lineas) WITH (IdPedidoDetalle INT '$.idPedidoDetalle', Cantidad INT '$.cantidad') j;
    END TRY
    BEGIN CATCH
        IF ERROR_NUMBER() IN (2601, 2627) THROW 50012, N'Una linea aparece repetida en la devolucion.', 1;
        THROW 50012, N'Formato de lineas invalido.', 1;
    END CATCH
    IF NOT EXISTS (SELECT 1 FROM @L) THROW 50012, N'Debe indicar al menos una linea a devolver.', 1;
    IF EXISTS (SELECT 1 FROM @L WHERE Cantidad IS NULL OR Cantidad <= 0 OR IDPedidoDetalle IS NULL) THROW 50012, N'Las cantidades a devolver deben ser mayores a cero.', 1;

    BEGIN TRY
        BEGIN TRAN;
        SELECT @Actual = IDEstadoPedido, @Num = NumeroPedido FROM Pedido WITH (UPDLOCK, ROWLOCK) WHERE IDPedido = @IDPedido;
        IF @Actual IS NULL THROW 50010, N'Pedido no encontrado.', 1;
        IF @Actual NOT IN (4, 6) THROW 50012, N'Solo se pueden registrar devoluciones de pedidos entregados.', 1;
        IF EXISTS (SELECT 1 FROM @L l LEFT JOIN PedidoDetalle d ON d.IDPedidoDetalle = l.IDPedidoDetalle AND d.IDPedido = @IDPedido WHERE d.IDPedidoDetalle IS NULL)
            THROW 50012, N'Una de las lineas no pertenece al pedido.', 1;

        INSERT INTO Devolucion (IDPedido, IDUsuario, Motivo, MontoReembolsado) VALUES (@IDPedido, @IDUsuario, LTRIM(RTRIM(@Motivo)), 0);
        SET @IDDev = SCOPE_IDENTITY();
        SET @MotivoKardex = CONCAT(N'Devolucion pedido ', @Num);

        WHILE 1 = 1      -- lineas en orden ascendente de variante (bloqueo ordenado)
        BEGIN
            SELECT TOP (1) @IDDet = d.IDPedidoDetalle, @V = d.IDVariante, @X = l.Cantidad, @Sku = d.SKU
              FROM @L l JOIN PedidoDetalle d ON d.IDPedidoDetalle = l.IDPedidoDetalle
             WHERE d.IDVariante > @V ORDER BY d.IDVariante;
            IF @@ROWCOUNT = 0 BREAK;

            UPDATE PedidoDetalle SET CantidadDevuelta = CantidadDevuelta + @X
             WHERE IDPedidoDetalle = @IDDet AND CantidadDevuelta + @X <= Cantidad;
            IF @@ROWCOUNT = 0
            BEGIN
                SET @Msg = CONCAT(N'No se puede devolver mas de la cantidad vendida en la linea ', @Sku, N'.');
                THROW 50012, @Msg, 1;
            END

            SELECT @CantTot = Cantidad, @Sub = Subtotal, @DevAhora = CantidadDevuelta FROM PedidoDetalle WHERE IDPedidoDetalle = @IDDet;
            SELECT @Previo = ISNULL(SUM(MontoReembolsado), 0) FROM DevolucionDetalle WHERE IDPedidoDetalle = @IDDet;
            SET @MontoLinea = CASE WHEN @DevAhora = @CantTot THEN @Sub - @Previo
                                   ELSE CAST(ROUND(@Sub * @X / @CantTot, 2) AS DECIMAL(18,2)) END;

            INSERT INTO DevolucionDetalle (IDDevolucion, IDPedidoDetalle, Cantidad, MontoReembolsado) VALUES (@IDDev, @IDDet, @X, @MontoLinea);
            SET @MontoTotal += @MontoLinea;

            EXEC SP_Inventario_RegistrarMovimiento @IDVariante = @V, @TipoMovimiento = 'Devolucion', @Cantidad = @X,
                 @Motivo = @MotivoKardex, @IDUsuario = @IDUsuario, @IDPedido = @IDPedido;
        END

        UPDATE Devolucion SET MontoReembolsado = @MontoTotal WHERE IDDevolucion = @IDDev;
        SELECT TOP (1) @Metodo = Metodo FROM Pago WHERE IDPedido = @IDPedido AND Estado = 'Aprobado' ORDER BY IDPago;
        IF @Metodo IS NOT NULL
            INSERT INTO Pago (IDPedido, Metodo, Referencia, Monto, Estado)
            VALUES (@IDPedido, @Metodo, CONCAT(N'REF-', CONVERT(NVARCHAR(36), NEWID())), @MontoTotal, 'Reembolsado');

        SET @Nuevo = CASE WHEN EXISTS (SELECT 1 FROM PedidoDetalle WHERE IDPedido = @IDPedido AND CantidadDevuelta < Cantidad) THEN 6 ELSE 7 END;
        IF @Nuevo <> @Actual
        BEGIN
            UPDATE Pedido SET IDEstadoPedido = @Nuevo WHERE IDPedido = @IDPedido;
            INSERT INTO PedidoHistorialEstado (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Comentario)
            VALUES (@IDPedido, @Actual, @Nuevo, @IDUsuario, CONCAT(N'Devolucion #', @IDDev));
        END

        SELECT @JAnt = (SELECT @Actual AS IDEstadoPedido FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        SELECT @JNue = (SELECT @Nuevo AS IDEstadoPedido, @IDDev AS IDDevolucion, @MontoTotal AS MontoReembolsado FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Pedidos', 'Pedido', @IDPedido, 'Modificacion', @JAnt, @JNue, @IDUsuario;
        COMMIT;

        SELECT @IDDev AS IDDevolucion, @MontoTotal AS MontoReembolsado, @Nuevo AS IDEstadoPedido,
               (SELECT Nombre FROM EstadoPedido WHERE IDEstadoPedido = @Nuevo) AS Estado;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

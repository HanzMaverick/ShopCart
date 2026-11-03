/* 003 - Catalogos base (roles, estados, transiciones) y triggers de integridad en BD */
USE ShopCart;
GO
SET NOCOUNT ON;
GO

INSERT INTO Rol (IDRol, Nombre) VALUES (1, N'Cliente'), (2, N'Operador'), (3, N'Administrador');

INSERT INTO EstadoPedido (IDEstadoPedido, Nombre, CuentaComoVenta) VALUES
 (1, N'Pagado',          1),
 (2, N'EnPreparacion',   1),
 (3, N'Despachado',      1),
 (4, N'Entregado',       1),
 (5, N'Cancelado',       0),
 (6, N'DevueltoParcial', 1),   -- los reportes descuentan el monto devuelto
 (7, N'DevueltoTotal',   1);

-- Ciclo de vida: Pagado -> EnPreparacion -> Despachado -> Entregado -> Devuelto(Parcial|Total)
-- Cancelacion solo antes de despachar.
INSERT INTO TransicionEstadoPedido (IDEstadoOrigen, IDEstadoDestino) VALUES
 (1, 2), (1, 5),
 (2, 3), (2, 5),
 (3, 4),
 (4, 6), (4, 7),
 (6, 7);
GO

/* Las transiciones invalidas tambien se rechazan en la base de datos */
CREATE TRIGGER TR_Pedido_ValidarTransicion ON Pedido AFTER UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF UPDATE(IDEstadoPedido) AND EXISTS (
        SELECT 1 FROM inserted i JOIN deleted d ON d.IDPedido = i.IDPedido
        WHERE i.IDEstadoPedido <> d.IDEstadoPedido
          AND NOT EXISTS (SELECT 1 FROM TransicionEstadoPedido t
                          WHERE t.IDEstadoOrigen = d.IDEstadoPedido AND t.IDEstadoDestino = i.IDEstadoPedido))
    BEGIN
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW 50001, N'Transicion de estado de pedido no permitida.', 1;
    END
END;
GO

/* Bitacora y Kardex son append-only */
CREATE TRIGGER TR_Bitacora_Inmutable ON Bitacora INSTEAD OF UPDATE, DELETE AS
BEGIN
    THROW 50002, N'La bitacora es inmutable: no se permite modificar ni eliminar registros.', 1;
END;
GO
CREATE TRIGGER TR_Kardex_Inmutable ON Kardex INSTEAD OF UPDATE, DELETE AS
BEGIN
    THROW 50003, N'El kardex es inmutable: corrija con un movimiento de ajuste.', 1;
END;
GO
CREATE TRIGGER TR_PedidoHistorialEstado_Inmutable ON PedidoHistorialEstado INSTEAD OF UPDATE, DELETE AS
BEGIN
    THROW 50004, N'El historial de estados es inmutable.', 1;
END;
GO

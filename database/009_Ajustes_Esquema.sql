/* 009 - Ajustes de esquema (migracion incremental sobre 002) necesarios para checkout, cupones y devoluciones.
   Se hacen como migracion numerada (no editando 002) para conservar el historial de cambios. */
USE ShopCart;
GO

-- Un uso de cupon se "anula" al cancelar el pedido (conserva historial y devuelve el cupo)
ALTER TABLE CuponUso ADD Anulado BIT NOT NULL CONSTRAINT DF_CuponUso_Anulado DEFAULT 0;
GO

-- Monto reembolsado por linea: permite que devoluciones parciales sumen exactamente el subtotal de la linea
ALTER TABLE DevolucionDetalle ADD MontoReembolsado DECIMAL(18,2) NOT NULL CONSTRAINT DF_DevDetalle_Monto DEFAULT 0;
GO
ALTER TABLE DevolucionDetalle ADD CONSTRAINT CK_DevDetalle_Monto CHECK (MontoReembolsado >= 0);
GO

-- Un pedido cubierto al 100 % por un cupon tiene total 0
ALTER TABLE Pago DROP CONSTRAINT CK_Pago_Monto;
GO
ALTER TABLE Pago ADD CONSTRAINT CK_Pago_Monto CHECK (Monto >= 0);
ALTER TABLE Pago ADD CONSTRAINT CK_Pago_Metodo CHECK (Metodo IN ('Tarjeta','Transferencia','Efectivo'));
GO

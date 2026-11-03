/* 016 - SEMILLA GRANDE para rendimiento (listados y reportes < 1 s) y para que el dashboard tenga datos.
   Genera, de forma set-based y reproducible: 2 000 clientes, 3 000 productos (~9 000 variantes), 50 000 pedidos de los ultimos
   12 meses con su detalle, pagos, historial de estados, devoluciones y cancelaciones, kardex coherente y bitacora.
   COHERENCIA: el kardex se arma con TODOS los movimientos (existencia inicial, ventas, cancelaciones, devoluciones, ajustes)
   y la existencia de cada variante es la suma de su kardex (VW_Inventario_ConciliacionKardex => Diferencia = 0).
   Cuentas de la semilla (@seed.shopcart.test): contrasena Seed123!  -  operador.seed@shopcart.test es el Operador.
   Es idempotente: si ya se aplico, no hace nada. Para aplicarla de nuevo use 000_Reiniciar.sql. */
USE ShopCart;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF EXISTS (SELECT 1 FROM Usuario WHERE Correo = N'operador.seed@shopcart.test')
BEGIN
    PRINT N'016: la semilla grande ya esta aplicada; se omite.';
END
ELSE
BEGIN
    BEGIN TRAN;

    DECLARE @Hash NVARCHAR(100) = N'$2b$12$YQZiPwtheS2tV5pHr3NpmOE/RFiNam31DkB2wuk0cfBIauBnRjAZq';   -- bcrypt de Seed123!
    DECLARE @NClientes INT = 2000, @NProductos INT = 3000, @NPedidos INT = 50000;
    DECLARE @Ahora DATETIME2(3) = SYSUTCDATETIME();
    DECLARE @IDOperador INT, @NV INT;

    /* ---------- 1) Usuarios y direcciones ---------- */
    INSERT INTO Usuario (IDRol, Correo, ContrasenaHash, Nombre) VALUES (2, N'operador.seed@shopcart.test', @Hash, N'Operador Semilla');
    SET @IDOperador = SCOPE_IDENTITY();

    ;WITH N AS (SELECT TOP (@NClientes) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b)
    INSERT INTO Usuario (IDRol, Correo, ContrasenaHash, Nombre, FechaCreacion)
    SELECT 1, CONCAT(N'cliente', RIGHT(CONCAT(N'0000', n), 4), N'@seed.shopcart.test'), @Hash, CONCAT(N'Cliente Semilla ', n),
           DATEADD(DAY, -(400 - (n % 380)), @Ahora)
      FROM N;

    SELECT ROW_NUMBER() OVER (ORDER BY IDUsuario) AS rn, IDUsuario INTO #Cli FROM Usuario WHERE Correo LIKE N'cliente%@seed.shopcart.test';

    INSERT INTO Direccion (IDUsuario, Alias, Linea1, Ciudad, Departamento, Telefono)
    SELECT IDUsuario, N'Casa', CONCAT(N'Calle ', rn, N' zona ', (rn % 25) + 1), N'Guatemala', N'Guatemala', CONCAT(N'5', RIGHT(CONCAT(N'0000000', rn), 7))
      FROM #Cli;

    /* ---------- 2) Categorias, productos, imagenes y variantes ---------- */
    INSERT INTO Categoria (Nombre, Descripcion) VALUES
      (N'Hogar', N'Dato de prueba'), (N'Tecnologia', N'Dato de prueba'), (N'Deportes', N'Dato de prueba'), (N'Juguetes', N'Dato de prueba'),
      (N'Belleza', N'Dato de prueba'), (N'Oficina', N'Dato de prueba'), (N'Jardin', N'Dato de prueba'), (N'Mascotas', N'Dato de prueba'),
      (N'Libros', N'Dato de prueba'), (N'Herramientas', N'Dato de prueba'), (N'Cocina', N'Dato de prueba'), (N'Automotriz', N'Dato de prueba');
    SELECT ROW_NUMBER() OVER (ORDER BY IDCategoria) AS rn, IDCategoria INTO #Cat FROM Categoria WHERE Descripcion = N'Dato de prueba';

    DECLARE @Adj TABLE (i INT IDENTITY(1,1), v NVARCHAR(30));
    INSERT INTO @Adj (v) VALUES (N'Clasico'), (N'Moderno'), (N'Premium'), (N'Basico'), (N'Compacto'), (N'Pro'), (N'Eco'), (N'Ligero'), (N'Resistente'), (N'Portatil');
    DECLARE @Sus TABLE (i INT IDENTITY(1,1), v NVARCHAR(30));
    INSERT INTO @Sus (v) VALUES (N'Lampara'), (N'Mochila'), (N'Audifonos'), (N'Balon'), (N'Cojin'), (N'Taza'), (N'Cuaderno'), (N'Cargador'), (N'Botella'), (N'Reloj'),
                                (N'Silla'), (N'Teclado'), (N'Raton'), (N'Maceta'), (N'Collar'), (N'Libro'), (N'Martillo'), (N'Sarten'), (N'Llanta'), (N'Crema');

    ;WITH N AS (SELECT TOP (@NProductos) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n FROM sys.all_objects a CROSS JOIN sys.all_objects b)
    INSERT INTO Producto (IDCategoria, Nombre, Descripcion, FechaCreacion)
    SELECT c.IDCategoria, CONCAT(s.v, N' ', a.v, N' ', n.n), N'Producto de prueba (semilla)', DATEADD(DAY, -(n.n % 330), @Ahora)
      FROM N n
      JOIN @Adj a ON a.i = (n.n % 10) + 1
      JOIN @Sus s ON s.i = ((n.n / 10) % 20) + 1
      JOIN #Cat c ON c.rn = (n.n % 12) + 1;

    SELECT ROW_NUMBER() OVER (ORDER BY IDProducto) AS rn, IDProducto, Nombre INTO #P FROM Producto WHERE Descripcion = N'Producto de prueba (semilla)';

    INSERT INTO ImagenProducto (IDProducto, Url, Orden) SELECT IDProducto, CONCAT(N'https://picsum.photos/seed/p', IDProducto, N'/400/400'), 0 FROM #P;

    INSERT INTO Variante (IDProducto, SKU, Atributos, Precio, ExistenciaFisica)
    SELECT p.IDProducto,
           CONCAT(N'SEED-', RIGHT(CONCAT(N'000000', p.IDProducto), 6), N'-', k.k),
           CONCAT(N'{"talla":"', CHOOSE(k.k, N'S', N'M', N'L', N'XL'), N'","color":"', CHOOSE((p.rn % 4) + 1, N'Negro', N'Blanco', N'Azul', N'Rojo'), N'"}'),
           CAST(10 + (ABS(CHECKSUM(NEWID())) % 99000) / 100.0 AS DECIMAL(18,2)),
           0
      FROM #P p
      JOIN (VALUES (1), (2), (3), (4)) k(k) ON k.k <= 2 + (p.rn % 3);

    SELECT ROW_NUMBER() OVER (ORDER BY IDVariante) AS rn, IDVariante, Precio, SKU, Atributos, IDProducto INTO #V FROM Variante WHERE SKU LIKE N'SEED-%';
    SELECT @NV = COUNT(*) FROM #V;

    INSERT INTO Bitacora (Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo, IDUsuario, Fecha)
    SELECT 'Catalogo', 'Producto', p.IDProducto, 'Creacion', NULL, CONCAT(N'{"Nombre":"', REPLACE(p.Nombre, N'"', N''), N'","Activo":true}'), @IDOperador, @Ahora
      FROM #P p;

    /* ---------- 3) Pedidos: atributos aleatorios materializados una sola vez ---------- */
    SELECT TOP (@NPedidos) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS Seq INTO #Seq FROM sys.all_objects a CROSS JOIN sys.all_objects b;

    SELECT s.Seq,
           1 + ABS(CHECKSUM(NEWID())) % 4 AS NLineas,
           1 + ABS(CHECKSUM(NEWID())) % @NClientes AS CliRn,
           ABS(CHECKSUM(NEWID())) % (365 * 24 * 60) AS MinAtras,
           ABS(CHECKSUM(NEWID())) % 100 AS R,
           ABS(CHECKSUM(NEWID())) % 3 AS MetodoI
      INTO #Ped FROM #Seq s;

    SELECT p.Seq, k.k AS Slot, 1 + ABS(CHECKSUM(NEWID())) % @NV AS VarRn, 1 + ABS(CHECKSUM(NEWID())) % 3 AS Cant
      INTO #L0 FROM #Ped p JOIN (VALUES (1), (2), (3), (4)) k(k) ON k.k <= p.NLineas;

    SELECT l.Seq, v.IDVariante, v.Precio, SUM(l.Cant) AS Cantidad
      INTO #L FROM #L0 l JOIN #V v ON v.rn = l.VarRn GROUP BY l.Seq, v.IDVariante, v.Precio;

    SELECT Seq, COUNT(*) AS NL, CAST(SUM(Precio * Cantidad) AS DECIMAL(18,2)) AS Subtotal INTO #Tot FROM #L GROUP BY Seq;

    -- Estado segun antiguedad: recientes en curso, antiguos entregados; ~6 % cancelados y ~7 % con devolucion
    SELECT p.Seq, p.CliRn, p.MetodoI, DATEADD(MINUTE, -p.MinAtras, @Ahora) AS Fecha, t.NL, t.Subtotal,
           CASE WHEN p.R < 6 THEN 5
                WHEN p.MinAtras / 1440 <= 1 THEN CASE WHEN p.R < 40 THEN 1 WHEN p.R < 75 THEN 2 ELSE 3 END
                WHEN p.MinAtras / 1440 <= 5 THEN CASE WHEN p.R < 20 THEN 2 WHEN p.R < 50 THEN 3 ELSE 4 END
                WHEN p.R < 12 THEN 6
                WHEN p.R < 15 THEN 7
                ELSE 4 END AS EstadoObj
      INTO #Fin0 FROM #Ped p JOIN #Tot t ON t.Seq = p.Seq;

    SELECT Seq, CliRn, MetodoI, Fecha, NL, Subtotal,
           CAST(CASE WHEN EstadoObj = 6 AND NL = 1 THEN 7 ELSE EstadoObj END AS TINYINT) AS Estado   -- devolucion "parcial" de 1 sola linea = total
      INTO #Fin FROM #Fin0;

    CREATE TABLE #Map (Seq INT NOT NULL PRIMARY KEY, IDPedido INT NOT NULL);
    MERGE INTO Pedido AS t
    USING (SELECT f.Seq, c.IDUsuario, f.Estado, f.Fecha, f.Subtotal, d.Linea1 AS Dir, d.Telefono AS Tel
             FROM #Fin f JOIN #Cli c ON c.rn = f.CliRn JOIN Direccion d ON d.IDUsuario = c.IDUsuario) AS s
       ON 1 = 0
     WHEN NOT MATCHED THEN
       INSERT (IDUsuario, IDEstadoPedido, DireccionEnvio, TelefonoContacto, Subtotal, Descuento, Total, MontoIVA, FechaCreacion)
       VALUES (s.IDUsuario, s.Estado, CONCAT(s.Dir, N', Guatemala, Guatemala'), s.Tel, s.Subtotal, 0, s.Subtotal,
               CAST(ROUND(s.Subtotal * 12 / 112, 2) AS DECIMAL(18,2)), s.Fecha)
     OUTPUT s.Seq, inserted.IDPedido INTO #Map (Seq, IDPedido);

    SELECT m.Seq, m.IDPedido, p.NumeroPedido INTO #Num FROM #Map m JOIN Pedido p ON p.IDPedido = m.IDPedido;

    INSERT INTO PedidoDetalle (IDPedido, IDVariante, SKU, NombreProducto, Atributos, PrecioUnitario, Cantidad, DescuentoLinea, Subtotal, CantidadDevuelta)
    SELECT m.IDPedido, l.IDVariante, v.SKU, pr.Nombre, v.Atributos, l.Precio, l.Cantidad, 0, l.Precio * l.Cantidad, 0
      FROM #L l
      JOIN #Map m ON m.Seq = l.Seq
      JOIN #V v ON v.IDVariante = l.IDVariante
      JOIN Producto pr ON pr.IDProducto = v.IDProducto;

    /* ---------- 4) Devoluciones: estado 6 = primera linea completa; estado 7 = todas las lineas ---------- */
    SELECT x.IDPedidoDetalle, x.IDPedido, x.IDVariante, x.Cantidad, x.Subtotal, DATEADD(DAY, 4, x.Fecha) AS FechaDev
      INTO #Dev
      FROM (SELECT d.IDPedidoDetalle, d.IDPedido, d.IDVariante, d.Cantidad, d.Subtotal, f.Fecha, f.Estado,
                   ROW_NUMBER() OVER (PARTITION BY d.IDPedido ORDER BY d.IDPedidoDetalle) AS Rk
              FROM PedidoDetalle d JOIN #Map m ON m.IDPedido = d.IDPedido JOIN #Fin f ON f.Seq = m.Seq
             WHERE f.Estado IN (6, 7)) x
     WHERE x.Estado = 7 OR x.Rk = 1;

    INSERT INTO Devolucion (IDPedido, IDUsuario, Motivo, MontoReembolsado, Fecha)
    SELECT IDPedido, @IDOperador, N'Devolucion de prueba (semilla)', SUM(Subtotal), MAX(FechaDev) FROM #Dev GROUP BY IDPedido;

    INSERT INTO DevolucionDetalle (IDDevolucion, IDPedidoDetalle, Cantidad, MontoReembolsado)
    SELECT dv.IDDevolucion, x.IDPedidoDetalle, x.Cantidad, x.Subtotal FROM #Dev x JOIN Devolucion dv ON dv.IDPedido = x.IDPedido;

    UPDATE d SET CantidadDevuelta = d.Cantidad FROM PedidoDetalle d JOIN #Dev x ON x.IDPedidoDetalle = d.IDPedidoDetalle;

    /* ---------- 5) Pagos ---------- */
    INSERT INTO Pago (IDPedido, Metodo, Referencia, Monto, Estado, Fecha)
    SELECT m.IDPedido, CHOOSE(f.MetodoI + 1, 'Tarjeta', 'Transferencia', 'Efectivo'), CONCAT(N'SEED-PAY-', m.IDPedido), f.Subtotal, 'Aprobado', f.Fecha
      FROM #Fin f JOIN #Map m ON m.Seq = f.Seq
    UNION ALL
    SELECT m.IDPedido, CHOOSE(f.MetodoI + 1, 'Tarjeta', 'Transferencia', 'Efectivo'), CONCAT(N'SEED-REF-', m.IDPedido), f.Subtotal, 'Reembolsado',
           CASE WHEN DATEADD(HOUR, 1, f.Fecha) > @Ahora THEN @Ahora ELSE DATEADD(HOUR, 1, f.Fecha) END
      FROM #Fin f JOIN #Map m ON m.Seq = f.Seq WHERE f.Estado = 5
    UNION ALL
    SELECT x.IDPedido, CHOOSE(f.MetodoI + 1, 'Tarjeta', 'Transferencia', 'Efectivo'), CONCAT(N'SEED-DEV-', x.IDPedido), SUM(x.Subtotal), 'Reembolsado', MAX(x.FechaDev)
      FROM #Dev x JOIN #Map m ON m.IDPedido = x.IDPedido JOIN #Fin f ON f.Seq = m.Seq GROUP BY x.IDPedido, f.MetodoI;

    /* ---------- 6) Historial de estados (inmutable por trigger: solo INSERT) ---------- */
    INSERT INTO PedidoHistorialEstado (IDPedido, IDEstadoAnterior, IDEstadoNuevo, IDUsuario, Fecha, Comentario)
    SELECT m.IDPedido, NULL, 1, c.IDUsuario, f.Fecha, N'Pedido creado y pagado'
      FROM #Fin f JOIN #Map m ON m.Seq = f.Seq JOIN #Cli c ON c.rn = f.CliRn
    UNION ALL
    SELECT m.IDPedido, 1, 2, @IDOperador, CASE WHEN DATEADD(HOUR, 1, f.Fecha) > @Ahora THEN @Ahora ELSE DATEADD(HOUR, 1, f.Fecha) END, NULL
      FROM #Fin f JOIN #Map m ON m.Seq = f.Seq WHERE f.Estado IN (2, 3, 4, 6, 7)
    UNION ALL
    SELECT m.IDPedido, 2, 3, @IDOperador, CASE WHEN DATEADD(HOUR, 6, f.Fecha) > @Ahora THEN @Ahora ELSE DATEADD(HOUR, 6, f.Fecha) END, NULL
      FROM #Fin f JOIN #Map m ON m.Seq = f.Seq WHERE f.Estado IN (3, 4, 6, 7)
    UNION ALL
    SELECT m.IDPedido, 3, 4, @IDOperador, CASE WHEN DATEADD(HOUR, 48, f.Fecha) > @Ahora THEN @Ahora ELSE DATEADD(HOUR, 48, f.Fecha) END, NULL
      FROM #Fin f JOIN #Map m ON m.Seq = f.Seq WHERE f.Estado IN (4, 6, 7)
    UNION ALL
    SELECT m.IDPedido, 1, 5, c.IDUsuario, CASE WHEN DATEADD(HOUR, 1, f.Fecha) > @Ahora THEN @Ahora ELSE DATEADD(HOUR, 1, f.Fecha) END, N'Cancelado por el cliente'
      FROM #Fin f JOIN #Map m ON m.Seq = f.Seq JOIN #Cli c ON c.rn = f.CliRn WHERE f.Estado = 5
    UNION ALL
    SELECT m.IDPedido, 4, f.Estado, @IDOperador, DATEADD(DAY, 4, f.Fecha), N'Devolucion registrada'
      FROM #Fin f JOIN #Map m ON m.Seq = f.Seq WHERE f.Estado IN (6, 7);

    /* ---------- 7) Kardex coherente (se arma en staging y se inserta una vez, con existencia resultante acumulada) ---------- */
    CREATE TABLE #Mov (Seq INT IDENTITY(1,1) PRIMARY KEY, IDVariante INT NOT NULL, Tipo VARCHAR(10) NOT NULL, Cantidad INT NOT NULL,
                       Fecha DATETIME2(3) NOT NULL, Orden TINYINT NOT NULL, Motivo NVARCHAR(300) NOT NULL, IDUsuario INT NOT NULL, IDPedido INT NULL);

    INSERT INTO #Mov (IDVariante, Tipo, Cantidad, Fecha, Orden, Motivo, IDUsuario, IDPedido)         -- existencia inicial
    SELECT IDVariante, 'Entrada', 400 + (ABS(CHECKSUM(NEWID())) % 600), DATEADD(DAY, -400, @Ahora), 0, N'Existencia inicial (semilla)', @IDOperador, NULL FROM #V;

    INSERT INTO #Mov (IDVariante, Tipo, Cantidad, Fecha, Orden, Motivo, IDUsuario, IDPedido)         -- ventas
    SELECT l.IDVariante, 'Salida', -l.Cantidad, f.Fecha, 1, CONCAT(N'Venta pedido ', n.NumeroPedido), c.IDUsuario, n.IDPedido
      FROM #L l JOIN #Fin f ON f.Seq = l.Seq JOIN #Num n ON n.Seq = l.Seq JOIN #Cli c ON c.rn = f.CliRn;

    INSERT INTO #Mov (IDVariante, Tipo, Cantidad, Fecha, Orden, Motivo, IDUsuario, IDPedido)         -- cancelaciones reintegran
    SELECT l.IDVariante, 'Devolucion', l.Cantidad, CASE WHEN DATEADD(HOUR, 1, f.Fecha) > @Ahora THEN @Ahora ELSE DATEADD(HOUR, 1, f.Fecha) END, 2,
           CONCAT(N'Cancelacion pedido ', n.NumeroPedido), @IDOperador, n.IDPedido
      FROM #L l JOIN #Fin f ON f.Seq = l.Seq JOIN #Num n ON n.Seq = l.Seq WHERE f.Estado = 5;

    INSERT INTO #Mov (IDVariante, Tipo, Cantidad, Fecha, Orden, Motivo, IDUsuario, IDPedido)         -- devoluciones reintegran
    SELECT x.IDVariante, 'Devolucion', x.Cantidad, x.FechaDev, 3, CONCAT(N'Devolucion pedido ', n.NumeroPedido), @IDOperador, x.IDPedido
      FROM #Dev x JOIN #Num n ON n.IDPedido = x.IDPedido;

    -- ~5 % de variantes quedan con poca o ninguna existencia (para probar filtros de bajo stock): ajuste final
    SELECT IDVariante, SUM(Cantidad) AS Neto INTO #Neto FROM #Mov GROUP BY IDVariante;
    INSERT INTO #Mov (IDVariante, Tipo, Cantidad, Fecha, Orden, Motivo, IDUsuario, IDPedido)
    SELECT n.IDVariante, 'Ajuste', -(n.Neto - (ABS(CHECKSUM(NEWID())) % 10)), @Ahora, 9, N'Ajuste de inventario fisico (semilla)', @IDOperador, NULL
      FROM #Neto n JOIN #V v ON v.IDVariante = n.IDVariante
     WHERE v.rn % 20 = 0 AND n.Neto > 10;

    INSERT INTO Kardex (IDVariante, TipoMovimiento, Cantidad, ExistenciaResultante, Motivo, IDUsuario, IDPedido, Fecha)
    SELECT IDVariante, Tipo, Cantidad,
           SUM(Cantidad) OVER (PARTITION BY IDVariante ORDER BY Fecha, Orden, Seq ROWS UNBOUNDED PRECEDING),
           Motivo, IDUsuario, IDPedido, Fecha
      FROM #Mov
     ORDER BY IDVariante, Fecha, Orden, Seq;

    UPDATE v SET ExistenciaFisica = s.Total
      FROM Variante v JOIN (SELECT IDVariante, SUM(Cantidad) AS Total FROM Kardex GROUP BY IDVariante) s ON s.IDVariante = v.IDVariante
     WHERE v.SKU LIKE N'SEED-%';

    /* ---------- 8) Bitacora de pedidos ---------- */
    INSERT INTO Bitacora (Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo, IDUsuario, Fecha)
    SELECT 'Pedidos', 'Pedido', m.IDPedido, 'Creacion', NULL,
           CONCAT(N'{"NumeroPedido":"', n.NumeroPedido, N'","Estado":"Pagado","Total":', CONVERT(NVARCHAR(30), f.Subtotal), N'}'), c.IDUsuario, f.Fecha
      FROM #Fin f JOIN #Map m ON m.Seq = f.Seq JOIN #Num n ON n.Seq = f.Seq JOIN #Cli c ON c.rn = f.CliRn;

    COMMIT;

    UPDATE STATISTICS Pedido; UPDATE STATISTICS PedidoDetalle; UPDATE STATISTICS Kardex; UPDATE STATISTICS Variante; UPDATE STATISTICS Producto;

    PRINT N'016: semilla aplicada. Revise VW_Inventario_ConciliacionKardex (Diferencia debe ser 0 en todas las filas).';
END
GO

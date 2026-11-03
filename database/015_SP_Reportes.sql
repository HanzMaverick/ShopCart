/* 015 - RF-08 Dashboard y reportes (solo Administrador; el rol se valida en el backend).
   REGLAS DE NEGOCIO (documentadas en el README):
   - Solo cuentan pedidos que no estan Cancelados ni DevueltoTotal (VW_Dashboard_VentasPedido). Las devoluciones parciales
     se descuentan del pedido al que pertenecen (se atribuyen a la fecha de la venta original).
   - Los dias se agrupan en hora de Guatemala (UTC-6, sin horario de verano). Los parametros @Desde/@Hasta son fechas locales inclusivas.
   - Semana = lunes a domingo. Toda respuesta trae primero un recordset "meta" con el rango efectivamente usado. */
USE ShopCart;
GO

-- Indices de apoyo: los reportes recorren pedidos por fecha y sus lineas
CREATE INDEX IX_PedidoDetalle_Reportes ON PedidoDetalle(IDPedido) INCLUDE (IDVariante, Cantidad, CantidadDevuelta, Subtotal);
CREATE INDEX IX_DevolucionDetalle_Detalle ON DevolucionDetalle(IDPedidoDetalle) INCLUDE (MontoReembolsado);
GO

CREATE VIEW VW_Dashboard_VentasPedido AS
SELECT p.IDPedido, p.IDUsuario, p.IDEstadoPedido, p.FechaCreacion, p.Total,
       ISNULL(d.Devuelto, 0) AS Devuelto,
       p.Total - ISNULL(d.Devuelto, 0) AS Neto
  FROM Pedido p
  JOIN EstadoPedido e ON e.IDEstadoPedido = p.IDEstadoPedido AND e.CuentaComoVenta = 1
  LEFT JOIN (SELECT IDPedido, SUM(MontoReembolsado) AS Devuelto FROM Devolucion GROUP BY IDPedido) d ON d.IDPedido = p.IDPedido
 WHERE p.IDEstadoPedido <> 7;      -- DevueltoTotal: la venta quedo anulada
GO

/* Inicio del periodo (dia, semana lunes-domingo o mes) al que pertenece una fecha. Independiente de SET DATEFIRST
   (1900-01-01 fue lunes). */
CREATE FUNCTION FU_Dashboard_Periodo (@Fecha DATE, @Agrupacion VARCHAR(6))
RETURNS TABLE
AS RETURN
SELECT CASE @Agrupacion
         WHEN 'Dia'    THEN @Fecha
         WHEN 'Semana' THEN DATEADD(DAY, -(DATEDIFF(DAY, '19000101', @Fecha) % 7), @Fecha)
         ELSE DATEFROMPARTS(YEAR(@Fecha), MONTH(@Fecha), 1)
       END AS Periodo;
GO

/* Interno: completa valores por defecto (ultimos 30 dias), valida y convierte el rango local a limites UTC. */
CREATE PROCEDURE SP_Reportes_NormalizarRango
    @Desde DATE OUTPUT, @Hasta DATE OUTPUT, @DesdeUtc DATETIME2(3) OUTPUT, @HastaUtc DATETIME2(3) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    IF @Hasta IS NULL SET @Hasta = CAST(DATEADD(HOUR, -6, SYSUTCDATETIME()) AS DATE);
    IF @Desde IS NULL SET @Desde = DATEADD(DAY, -29, @Hasta);
    IF @Desde > @Hasta THROW 50012, N'La fecha inicial no puede ser posterior a la final.', 1;
    IF DATEDIFF(DAY, @Desde, @Hasta) > 1100 THROW 50012, N'El rango maximo permitido es de 1100 dias.', 1;
    SET @DesdeUtc = DATEADD(HOUR, 6, CAST(@Desde AS DATETIME2(3)));
    SET @HastaUtc = DATEADD(HOUR, 6, CAST(DATEADD(DAY, 1, @Hasta) AS DATETIME2(3)));
END;
GO

/* Ventas por dia, semana o mes, en quetzales y en numero de pedidos (periodos sin ventas aparecen en cero).
   Recordsets: 1 meta, 2 serie. */
CREATE PROCEDURE SP_Reportes_VentasPorPeriodo
    @Agrupacion VARCHAR(6) = 'Dia', @Desde DATE = NULL, @Hasta DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    IF @Agrupacion IS NULL OR @Agrupacion NOT IN ('Dia', 'Semana', 'Mes') THROW 50012, N'La agrupacion debe ser Dia, Semana o Mes.', 1;
    IF @Hasta IS NULL SET @Hasta = CAST(DATEADD(HOUR, -6, SYSUTCDATETIME()) AS DATE);
    IF @Desde IS NULL SET @Desde = CASE @Agrupacion WHEN 'Dia' THEN DATEADD(DAY, -29, @Hasta)
                                                     WHEN 'Semana' THEN DATEADD(WEEK, -11, @Hasta)
                                                     ELSE DATEADD(MONTH, -11, @Hasta) END;
    DECLARE @DesdeUtc DATETIME2(3), @HastaUtc DATETIME2(3);
    EXEC SP_Reportes_NormalizarRango @Desde = @Desde OUTPUT, @Hasta = @Hasta OUTPUT, @DesdeUtc = @DesdeUtc OUTPUT, @HastaUtc = @HastaUtc OUTPUT;

    SELECT CONVERT(CHAR(10), @Desde, 23) AS Desde, CONVERT(CHAR(10), @Hasta, 23) AS Hasta, @Agrupacion AS Agrupacion;

    ;WITH Dias AS (
        SELECT @Desde AS D
        UNION ALL
        SELECT DATEADD(DAY, 1, D) FROM Dias WHERE D < @Hasta
    ),
    Periodos AS (
        SELECT DISTINCT p.Periodo FROM Dias x CROSS APPLY FU_Dashboard_Periodo(x.D, @Agrupacion) p
    ),
    Ventas AS (
        SELECT p.Periodo, COUNT(*) AS Pedidos, SUM(v.Total) AS Brutas, SUM(v.Devuelto) AS Devoluciones, SUM(v.Neto) AS Netas
          FROM VW_Dashboard_VentasPedido v
          CROSS APPLY (SELECT CAST(DATEADD(HOUR, -6, v.FechaCreacion) AS DATE) AS D) l
          CROSS APPLY FU_Dashboard_Periodo(l.D, @Agrupacion) p
         WHERE v.FechaCreacion >= @DesdeUtc AND v.FechaCreacion < @HastaUtc
         GROUP BY p.Periodo
    )
    SELECT CONVERT(CHAR(10), pe.Periodo, 23) AS Periodo,
           ISNULL(ve.Pedidos, 0) AS Pedidos,
           CAST(ISNULL(ve.Brutas, 0) AS DECIMAL(18,2)) AS VentasBrutas,
           CAST(ISNULL(ve.Devoluciones, 0) AS DECIMAL(18,2)) AS Devoluciones,
           CAST(ISNULL(ve.Netas, 0) AS DECIMAL(18,2)) AS VentasNetas,
           CASE WHEN ve.Pedidos > 0 THEN CAST(ve.Netas / ve.Pedidos AS DECIMAL(18,2)) ELSE CAST(0 AS DECIMAL(18,2)) END AS TicketPromedio
      FROM Periodos pe
      LEFT JOIN Ventas ve ON ve.Periodo = pe.Periodo
     ORDER BY pe.Periodo
    OPTION (MAXRECURSION 1200);
END;
GO

/* Indicadores del periodo. Ticket promedio = ventas netas / pedidos. Recordsets: 1 meta, 2 una fila. */
CREATE PROCEDURE SP_Reportes_Resumen
    @Desde DATE = NULL, @Hasta DATE = NULL, @HorasAbandono INT = 24
AS
BEGIN
    SET NOCOUNT ON;
    IF @HorasAbandono IS NULL OR @HorasAbandono < 1 OR @HorasAbandono > 720 THROW 50012, N'Las horas de abandono deben estar entre 1 y 720.', 1;
    DECLARE @DesdeUtc DATETIME2(3), @HastaUtc DATETIME2(3);
    EXEC SP_Reportes_NormalizarRango @Desde = @Desde OUTPUT, @Hasta = @Hasta OUTPUT, @DesdeUtc = @DesdeUtc OUTPUT, @HastaUtc = @HastaUtc OUTPUT;
    SELECT CONVERT(CHAR(10), @Desde, 23) AS Desde, CONVERT(CHAR(10), @Hasta, 23) AS Hasta;

    DECLARE @Pedidos INT, @Brutas DECIMAL(18,2), @Dev DECIMAL(18,2), @Netas DECIMAL(18,2), @Clientes INT, @Unidades INT,
            @CarritosAb INT, @ValorAb DECIMAL(18,2);

    SELECT @Pedidos = COUNT(*), @Brutas = ISNULL(SUM(Total), 0), @Dev = ISNULL(SUM(Devuelto), 0), @Netas = ISNULL(SUM(Neto), 0),
           @Clientes = COUNT(DISTINCT IDUsuario)
      FROM VW_Dashboard_VentasPedido WHERE FechaCreacion >= @DesdeUtc AND FechaCreacion < @HastaUtc;

    SELECT @Unidades = ISNULL(SUM(d.Cantidad - d.CantidadDevuelta), 0)
      FROM VW_Dashboard_VentasPedido v JOIN PedidoDetalle d ON d.IDPedido = v.IDPedido
     WHERE v.FechaCreacion >= @DesdeUtc AND v.FechaCreacion < @HastaUtc;

    SELECT @CarritosAb = COUNT(*), @ValorAb = ISNULL(SUM(x.Valor), 0)
      FROM (SELECT k.IDCarrito, SUM(d.Cantidad * v.Precio) AS Valor
              FROM Carrito k JOIN CarritoDetalle d ON d.IDCarrito = k.IDCarrito JOIN Variante v ON v.IDVariante = d.IDVariante
             WHERE k.Estado = 'Activo' AND k.UltimaActividad < DATEADD(HOUR, -@HorasAbandono, SYSUTCDATETIME())
             GROUP BY k.IDCarrito) x;

    SELECT @Pedidos AS Pedidos, @Brutas AS VentasBrutas, @Dev AS Devoluciones, @Netas AS VentasNetas,
           CASE WHEN @Pedidos > 0 THEN CAST(@Netas / @Pedidos AS DECIMAL(18,2)) ELSE CAST(0 AS DECIMAL(18,2)) END AS TicketPromedio,
           @Unidades AS UnidadesVendidas, @Clientes AS ClientesConCompra,
           @CarritosAb AS CarritosAbandonados, @ValorAb AS ValorCarritosAbandonados, @HorasAbandono AS HorasAbandono;
END;
GO

/* Ventas netas por categoria (unidades y quetzales, descontando devoluciones). Recordsets: 1 meta, 2 detalle. */
CREATE PROCEDURE SP_Reportes_VentasPorCategoria
    @Desde DATE = NULL, @Hasta DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @DesdeUtc DATETIME2(3), @HastaUtc DATETIME2(3);
    EXEC SP_Reportes_NormalizarRango @Desde = @Desde OUTPUT, @Hasta = @Hasta OUTPUT, @DesdeUtc = @DesdeUtc OUTPUT, @HastaUtc = @HastaUtc OUTPUT;
    SELECT CONVERT(CHAR(10), @Desde, 23) AS Desde, CONVERT(CHAR(10), @Hasta, 23) AS Hasta;

    SELECT c.IDCategoria, c.Nombre AS Categoria,
           SUM(d.Cantidad - d.CantidadDevuelta) AS Unidades,
           CAST(SUM(d.Subtotal - ISNULL(r.Dev, 0)) AS DECIMAL(18,2)) AS VentasNetas,
           COUNT(DISTINCT v.IDPedido) AS Pedidos
      FROM VW_Dashboard_VentasPedido v
      JOIN PedidoDetalle d ON d.IDPedido = v.IDPedido
      JOIN Variante va ON va.IDVariante = d.IDVariante
      JOIN Producto pr ON pr.IDProducto = va.IDProducto
      JOIN Categoria c ON c.IDCategoria = pr.IDCategoria
      OUTER APPLY (SELECT SUM(x.MontoReembolsado) AS Dev FROM DevolucionDetalle x WHERE x.IDPedidoDetalle = d.IDPedidoDetalle) r
     WHERE v.FechaCreacion >= @DesdeUtc AND v.FechaCreacion < @HastaUtc
     GROUP BY c.IDCategoria, c.Nombre
     ORDER BY VentasNetas DESC;
END;
GO

/* Productos mas vendidos del periodo (por unidades netas; desempata por quetzales). Recordsets: 1 meta, 2 ranking. */
CREATE PROCEDURE SP_Reportes_TopProductos
    @Desde DATE = NULL, @Hasta DATE = NULL, @Top INT = 10
AS
BEGIN
    SET NOCOUNT ON;
    IF @Top IS NULL OR @Top < 1 OR @Top > 50 THROW 50012, N'El top debe estar entre 1 y 50.', 1;
    DECLARE @DesdeUtc DATETIME2(3), @HastaUtc DATETIME2(3);
    EXEC SP_Reportes_NormalizarRango @Desde = @Desde OUTPUT, @Hasta = @Hasta OUTPUT, @DesdeUtc = @DesdeUtc OUTPUT, @HastaUtc = @HastaUtc OUTPUT;
    SELECT CONVERT(CHAR(10), @Desde, 23) AS Desde, CONVERT(CHAR(10), @Hasta, 23) AS Hasta;

    SELECT TOP (@Top) pr.IDProducto, pr.Nombre AS Producto, c.Nombre AS Categoria,
           SUM(d.Cantidad - d.CantidadDevuelta) AS Unidades,
           CAST(SUM(d.Subtotal - ISNULL(r.Dev, 0)) AS DECIMAL(18,2)) AS VentasNetas
      FROM VW_Dashboard_VentasPedido v
      JOIN PedidoDetalle d ON d.IDPedido = v.IDPedido
      JOIN Variante va ON va.IDVariante = d.IDVariante
      JOIN Producto pr ON pr.IDProducto = va.IDProducto
      JOIN Categoria c ON c.IDCategoria = pr.IDCategoria
      OUTER APPLY (SELECT SUM(x.MontoReembolsado) AS Dev FROM DevolucionDetalle x WHERE x.IDPedidoDetalle = d.IDPedidoDetalle) r
     WHERE v.FechaCreacion >= @DesdeUtc AND v.FechaCreacion < @HastaUtc
     GROUP BY pr.IDProducto, pr.Nombre, c.Nombre
     ORDER BY SUM(d.Cantidad - d.CantidadDevuelta) DESC, SUM(d.Subtotal - ISNULL(r.Dev, 0)) DESC;
END;
GO

/* Pedidos del periodo por estado (aqui SI aparecen cancelados y devueltos, para ver el embudo). Recordsets: 1 meta, 2 detalle. */
CREATE PROCEDURE SP_Reportes_PedidosPorEstado
    @Desde DATE = NULL, @Hasta DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @DesdeUtc DATETIME2(3), @HastaUtc DATETIME2(3);
    EXEC SP_Reportes_NormalizarRango @Desde = @Desde OUTPUT, @Hasta = @Hasta OUTPUT, @DesdeUtc = @DesdeUtc OUTPUT, @HastaUtc = @HastaUtc OUTPUT;
    SELECT CONVERT(CHAR(10), @Desde, 23) AS Desde, CONVERT(CHAR(10), @Hasta, 23) AS Hasta;

    SELECT e.IDEstadoPedido, e.Nombre AS Estado, COUNT(p.IDPedido) AS Pedidos, CAST(ISNULL(SUM(p.Total), 0) AS DECIMAL(18,2)) AS Monto
      FROM EstadoPedido e
      LEFT JOIN Pedido p ON p.IDEstadoPedido = e.IDEstadoPedido AND p.FechaCreacion >= @DesdeUtc AND p.FechaCreacion < @HastaUtc
     GROUP BY e.IDEstadoPedido, e.Nombre
     ORDER BY e.IDEstadoPedido;
END;
GO

/* Carritos abandonados: activos, con productos y sin actividad durante @Horas (periodo configurable). Paginado. */
CREATE PROCEDURE SP_Reportes_CarritosAbandonados
    @Horas INT = 24, @Pagina INT = 1, @TamanoPagina INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @Horas IS NULL OR @Horas < 1 OR @Horas > 720 THROW 50012, N'Las horas de inactividad deben estar entre 1 y 720.', 1;
    IF @Pagina IS NULL OR @Pagina < 1 SET @Pagina = 1;
    IF @TamanoPagina IS NULL OR @TamanoPagina < 1 SET @TamanoPagina = 20;
    IF @TamanoPagina > 100 SET @TamanoPagina = 100;

    SELECT k.IDCarrito, k.IDUsuario, ISNULL(u.Nombre, N'Invitado') AS Cliente, u.Correo,
           SUM(d.Cantidad) AS Unidades,
           CAST(SUM(d.Cantidad * v.Precio) AS DECIMAL(18,2)) AS Valor,
           k.UltimaActividad,
           DATEDIFF(HOUR, k.UltimaActividad, SYSUTCDATETIME()) AS HorasInactivo,
           COUNT(*) OVER() AS TotalRegistros,
           CAST(SUM(SUM(d.Cantidad * v.Precio)) OVER() AS DECIMAL(18,2)) AS ValorTotal
      FROM Carrito k
      JOIN CarritoDetalle d ON d.IDCarrito = k.IDCarrito
      JOIN Variante v ON v.IDVariante = d.IDVariante
      LEFT JOIN Usuario u ON u.IDUsuario = k.IDUsuario
     WHERE k.Estado = 'Activo' AND k.UltimaActividad < DATEADD(HOUR, -@Horas, SYSUTCDATETIME())
     GROUP BY k.IDCarrito, k.IDUsuario, u.Nombre, u.Correo, k.UltimaActividad
     ORDER BY k.UltimaActividad DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

/* 017 - Corrige el filtro de precio del catalogo (SP_Productos_Buscar).
   ANTES: el filtro comparaba RANGOS (precio minimo y maximo del producto contra el rango pedido). Con variantes de precios muy
          distintos, un producto aparecia aunque NINGUNA de sus variantes estuviera dentro del rango pedido, y su tarjeta
          mostraba un "desde" por debajo del minimo.
   AHORA: un producto aparece si AL MENOS UNA variante activa tiene precio dentro de [@PrecioMin, @PrecioMax]; el rango de
          precios, la disponibilidad y el orden por precio se calculan solo con las variantes que cumplen el filtro.
   Migracion numerada: se ejecuta despues de 007 (no se edita el script original). */
USE ShopCart;
GO

ALTER PROCEDURE SP_Productos_Buscar
    @Texto           NVARCHAR(100) = NULL,
    @IDCategoria     INT = NULL,
    @PrecioMin       DECIMAL(18,2) = NULL,
    @PrecioMax       DECIMAL(18,2) = NULL,
    @SoloDisponibles BIT = 0,
    @SoloActivos     BIT = 1,                   -- tienda = 1, administracion = 0
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
    IF @PrecioMin IS NOT NULL AND @PrecioMax IS NOT NULL AND @PrecioMin > @PrecioMax
        THROW 50012, N'El precio minimo no puede ser mayor que el maximo.', 1;

    DECLARE @FiltraPrecio BIT = CASE WHEN @PrecioMin IS NULL AND @PrecioMax IS NULL THEN 0 ELSE 1 END;

    DECLARE @Patron NVARCHAR(210) = NULL;       -- escapa comodines para que el texto se busque literal
    IF @Texto IS NOT NULL AND LEN(LTRIM(RTRIM(@Texto))) > 0
        SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Texto)), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%';

    ;WITH Agg AS (
        -- Solo variantes activas que cumplen el filtro de precio
        SELECT v.IDProducto, MIN(v.Precio) AS PrecioMin, MAX(v.Precio) AS PrecioMax,
               SUM(v.ExistenciaFisica - v.ExistenciaReservada) AS Disponible
          FROM Variante v
         WHERE v.Activa = 1
           AND (@PrecioMin IS NULL OR v.Precio >= @PrecioMin)
           AND (@PrecioMax IS NULL OR v.Precio <= @PrecioMax)
         GROUP BY v.IDProducto
    )
    SELECT p.IDProducto, p.Nombre, p.IDCategoria, c.Nombre AS NombreCategoria, p.Activo,
           a.PrecioMin, a.PrecioMax, ISNULL(a.Disponible, 0) AS ExistenciaDisponible,
           img.Url AS ImagenUrl, COUNT(*) OVER() AS TotalRegistros
      FROM Producto p
      JOIN Categoria c ON c.IDCategoria = p.IDCategoria
      LEFT JOIN Agg a  ON a.IDProducto  = p.IDProducto
      OUTER APPLY (SELECT TOP (1) i.Url FROM ImagenProducto i WHERE i.IDProducto = p.IDProducto ORDER BY i.Orden, i.IDImagenProducto) img
     WHERE (@SoloActivos = 0 OR (p.Activo = 1 AND c.Activa = 1 AND a.IDProducto IS NOT NULL))
       AND (@FiltraPrecio = 0 OR a.IDProducto IS NOT NULL)          -- con filtro de precio: debe existir una variante dentro del rango
       AND (@IDCategoria IS NULL OR p.IDCategoria = @IDCategoria)
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

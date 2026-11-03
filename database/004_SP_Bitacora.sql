/* 004 - Bitacora: SPs de registro y consulta.
   CONVENCION DE ERRORES (THROW) que el backend traduce a HTTP:
     50010 No encontrado      -> 404
     50011 Conflicto/duplicado-> 409
     50012 Validacion/regla   -> 422
     50013 Prohibido          -> 403
     50014 No autenticado     -> 401
     547 / 2627 / 2601 (violacion de constraint) -> los SPs los traducen a 50011/50012 cuando aplica.
   Los mensajes van sin tildes a proposito (evita problemas de codificacion en sqlcmd/SSMS). */
USE ShopCart;
GO

-- La eliminacion fisica (categorias, productos sin historial) tambien se audita
ALTER TABLE Bitacora DROP CONSTRAINT CK_Bitacora_Accion;
ALTER TABLE Bitacora ADD CONSTRAINT CK_Bitacora_Accion CHECK (Accion IN ('Creacion','Modificacion','Desactivacion','Eliminacion'));
GO

CREATE PROCEDURE SP_Bitacora_Registrar
    @Modulo        VARCHAR(20),
    @Entidad       VARCHAR(40),
    @IDEntidad     INT,
    @Accion        VARCHAR(15),
    @ValorAnterior NVARCHAR(MAX) = NULL,
    @ValorNuevo    NVARCHAR(MAX) = NULL,
    @IDUsuario     INT
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO Bitacora (Modulo, Entidad, IDEntidad, Accion, ValorAnterior, ValorNuevo, IDUsuario)
    VALUES (@Modulo, @Entidad, @IDEntidad, @Accion, @ValorAnterior, @ValorNuevo, @IDUsuario);
END;
GO

CREATE PROCEDURE SP_Bitacora_Listar
    @Modulo        VARCHAR(20) = NULL,
    @Pagina        INT = 1,
    @TamanoPagina  INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @Pagina IS NULL OR @Pagina < 1 SET @Pagina = 1;
    IF @TamanoPagina IS NULL OR @TamanoPagina < 1 SET @TamanoPagina = 20;
    IF @TamanoPagina > 100 SET @TamanoPagina = 100;

    SELECT b.IDBitacora, b.Modulo, b.Entidad, b.IDEntidad, b.Accion,
           b.ValorAnterior, b.ValorNuevo, b.IDUsuario, u.Nombre AS NombreUsuario, b.Fecha,
           COUNT(*) OVER() AS TotalRegistros
    FROM Bitacora b
    JOIN Usuario u ON u.IDUsuario = b.IDUsuario
    WHERE (@Modulo IS NULL OR b.Modulo = @Modulo)
    ORDER BY b.IDBitacora DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

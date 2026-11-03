/* 008 - Utilidades del sistema: ping (health check) y creacion del primer administrador */
USE ShopCart;
GO

CREATE PROCEDURE SP_Sistema_Ping
AS
BEGIN
    SET NOCOUNT ON;
    SELECT 1 AS Ok;
END;
GO

/* Bootstrap: solo funciona mientras NO exista ningun administrador (el seed lo usa una vez). */
CREATE PROCEDURE SP_Usuarios_CrearAdministradorInicial
    @Correo         NVARCHAR(256),
    @ContrasenaHash NVARCHAR(100),
    @Nombre         NVARCHAR(150)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @ID INT, @Nuevo NVARCHAR(MAX);
    BEGIN TRY
        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM Usuario WITH (UPDLOCK, HOLDLOCK) WHERE IDRol = 3)
            THROW 50011, N'Ya existe un administrador.', 1;
        INSERT INTO Usuario (IDRol, Correo, ContrasenaHash, Nombre)
        VALUES (3, LOWER(LTRIM(RTRIM(@Correo))), @ContrasenaHash, LTRIM(RTRIM(@Nombre)));
        SET @ID = SCOPE_IDENTITY();
        SET @Nuevo = (SELECT IDUsuario, IDRol, Correo, Nombre, Activo FROM Usuario WHERE IDUsuario = @ID FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Usuarios', 'Usuario', @ID, 'Creacion', NULL, @Nuevo, @ID;
        COMMIT;
        SELECT u.IDUsuario, u.IDRol, r.Nombre AS Rol, u.Correo, u.Nombre, u.Activo
        FROM Usuario u JOIN Rol r ON r.IDRol = u.IDRol WHERE u.IDUsuario = @ID;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        IF ERROR_NUMBER() IN (2601, 2627) THROW 50011, N'El correo ya esta registrado.', 1;
        THROW;
    END CATCH
END;
GO

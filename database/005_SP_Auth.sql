/* 005 - RF-01 Autenticacion y usuarios. El hash de contrasena (bcrypt) lo calcula el backend; la BD solo lo almacena. */
USE ShopCart;
GO

CREATE PROCEDURE SP_Usuarios_Registrar      -- registro publico: siempre rol Cliente
    @Correo         NVARCHAR(256),
    @ContrasenaHash NVARCHAR(100),
    @Nombre         NVARCHAR(150)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @CorreoN NVARCHAR(256) = LOWER(LTRIM(RTRIM(@Correo))), @ID INT, @Nuevo NVARCHAR(MAX);
    BEGIN TRY
        BEGIN TRAN;
        IF EXISTS (SELECT 1 FROM Usuario WHERE Correo = @CorreoN) THROW 50011, N'El correo ya esta registrado.', 1;
        INSERT INTO Usuario (IDRol, Correo, ContrasenaHash, Nombre) VALUES (1, @CorreoN, @ContrasenaHash, LTRIM(RTRIM(@Nombre)));
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

CREATE PROCEDURE SP_Usuarios_Crear          -- lo usa el Administrador para crear Operadores/Administradores
    @IDRol          TINYINT,
    @Correo         NVARCHAR(256),
    @ContrasenaHash NVARCHAR(100),
    @Nombre         NVARCHAR(150),
    @IDUsuarioActor INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @CorreoN NVARCHAR(256) = LOWER(LTRIM(RTRIM(@Correo))), @ID INT, @Nuevo NVARCHAR(MAX);
    BEGIN TRY
        BEGIN TRAN;
        IF NOT EXISTS (SELECT 1 FROM Rol WHERE IDRol = @IDRol) THROW 50012, N'El rol indicado no existe.', 1;
        IF EXISTS (SELECT 1 FROM Usuario WHERE Correo = @CorreoN) THROW 50011, N'El correo ya esta registrado.', 1;
        INSERT INTO Usuario (IDRol, Correo, ContrasenaHash, Nombre) VALUES (@IDRol, @CorreoN, @ContrasenaHash, LTRIM(RTRIM(@Nombre)));
        SET @ID = SCOPE_IDENTITY();
        SET @Nuevo = (SELECT IDUsuario, IDRol, Correo, Nombre, Activo FROM Usuario WHERE IDUsuario = @ID FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
        EXEC SP_Bitacora_Registrar 'Usuarios', 'Usuario', @ID, 'Creacion', NULL, @Nuevo, @IDUsuarioActor;
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

CREATE PROCEDURE SP_Usuarios_ObtenerPorCorreo   -- login: devuelve el hash para que el backend lo compare
    @Correo NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.IDUsuario, u.IDRol, r.Nombre AS Rol, u.Correo, u.ContrasenaHash, u.Nombre, u.Activo
    FROM Usuario u JOIN Rol r ON r.IDRol = u.IDRol
    WHERE u.Correo = LOWER(LTRIM(RTRIM(@Correo)));
END;
GO

CREATE PROCEDURE SP_Usuarios_ObtenerPorID       -- sin hash
    @IDUsuario INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT u.IDUsuario, u.IDRol, r.Nombre AS Rol, u.Correo, u.Nombre, u.Activo, u.FechaCreacion
    FROM Usuario u JOIN Rol r ON r.IDRol = u.IDRol
    WHERE u.IDUsuario = @IDUsuario;
    IF @@ROWCOUNT = 0 THROW 50010, N'Usuario no encontrado.', 1;
END;
GO

CREATE PROCEDURE SP_Usuarios_Listar
    @Busqueda      NVARCHAR(100) = NULL,
    @IDRol         TINYINT = NULL,
    @Activo        BIT = NULL,
    @Pagina        INT = 1,
    @TamanoPagina  INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    IF @Pagina IS NULL OR @Pagina < 1 SET @Pagina = 1;
    IF @TamanoPagina IS NULL OR @TamanoPagina < 1 SET @TamanoPagina = 20;
    IF @TamanoPagina > 100 SET @TamanoPagina = 100;
    DECLARE @Patron NVARCHAR(210) = NULL;
    IF @Busqueda IS NOT NULL AND LEN(LTRIM(RTRIM(@Busqueda))) > 0
        SET @Patron = N'%' + REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@Busqueda)), N'[', N'[[]'), N'%', N'[%]'), N'_', N'[_]') + N'%';

    SELECT u.IDUsuario, u.Correo, u.Nombre, u.IDRol, r.Nombre AS Rol, u.Activo, u.FechaCreacion,
           COUNT(*) OVER() AS TotalRegistros
    FROM Usuario u JOIN Rol r ON r.IDRol = u.IDRol
    WHERE (@Patron IS NULL OR u.Correo LIKE @Patron OR u.Nombre LIKE @Patron)
      AND (@IDRol IS NULL OR u.IDRol = @IDRol)
      AND (@Activo IS NULL OR u.Activo = @Activo)
    ORDER BY u.IDUsuario DESC
    OFFSET (@Pagina - 1) * @TamanoPagina ROWS FETCH NEXT @TamanoPagina ROWS ONLY;
END;
GO

CREATE PROCEDURE SP_Usuarios_CambiarEstado     -- desactivar sin borrar (y revocar sus sesiones)
    @IDUsuario      INT,
    @Activo         BIT,
    @IDUsuarioActor INT
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    IF @IDUsuario = @IDUsuarioActor AND @Activo = 0 THROW 50012, N'No puede desactivar su propia cuenta.', 1;
    DECLARE @Anterior BIT, @Ant NVARCHAR(MAX), @Nue NVARCHAR(MAX), @Accion VARCHAR(15);
    BEGIN TRY
        BEGIN TRAN;
        SELECT @Anterior = Activo FROM Usuario WITH (UPDLOCK, ROWLOCK) WHERE IDUsuario = @IDUsuario;
        IF @Anterior IS NULL THROW 50010, N'Usuario no encontrado.', 1;
        IF @Anterior <> @Activo
        BEGIN
            SET @Ant = (SELECT @Anterior AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            SET @Nue = (SELECT @Activo   AS Activo FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
            SET @Accion = CASE WHEN @Activo = 0 THEN 'Desactivacion' ELSE 'Modificacion' END;
            UPDATE Usuario SET Activo = @Activo WHERE IDUsuario = @IDUsuario;
            IF @Activo = 0
                UPDATE TokenRefresco SET FechaRevocado = SYSUTCDATETIME() WHERE IDUsuario = @IDUsuario AND FechaRevocado IS NULL;
            EXEC SP_Bitacora_Registrar 'Usuarios', 'Usuario', @IDUsuario, @Accion, @Ant, @Nue, @IDUsuarioActor;
        END
        COMMIT;
        SELECT IDUsuario, Activo FROM Usuario WHERE IDUsuario = @IDUsuario;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

/* ---------- Refresh tokens con rotacion y deteccion de reutilizacion ---------- */
CREATE PROCEDURE SP_Auth_GuardarTokenRefresco   -- primer token de una sesion (login)
    @IDUsuario   INT,
    @IDFamilia   UNIQUEIDENTIFIER,
    @TokenHash   CHAR(64),
    @FechaExpira DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO TokenRefresco (IDUsuario, IDFamilia, TokenHash, FechaExpira)
    VALUES (@IDUsuario, @IDFamilia, @TokenHash, @FechaExpira);
    SELECT SCOPE_IDENTITY() AS IDTokenRefresco;
END;
GO

CREATE PROCEDURE SP_Auth_RotarTokenRefresco
    @TokenHashActual  CHAR(64),
    @TokenHashNuevo   CHAR(64),
    @FechaExpiraNueva DATETIME2(3)
AS
BEGIN
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @IDToken BIGINT, @IDUsuario INT, @IDFamilia UNIQUEIDENTIFIER, @Expira DATETIME2(3),
            @Revocado DATETIME2(3), @Activo BIT, @IDNuevo BIGINT, @Ahora DATETIME2(3) = SYSUTCDATETIME();
    BEGIN TRY
        BEGIN TRAN;
        SELECT @IDToken = t.IDTokenRefresco, @IDUsuario = t.IDUsuario, @IDFamilia = t.IDFamilia,
               @Expira = t.FechaExpira, @Revocado = t.FechaRevocado, @Activo = u.Activo
        FROM TokenRefresco t WITH (UPDLOCK, HOLDLOCK)
        JOIN Usuario u ON u.IDUsuario = t.IDUsuario
        WHERE t.TokenHash = @TokenHashActual;

        IF @IDToken IS NULL THROW 50014, N'Token de refresco invalido.', 1;

        IF @Revocado IS NOT NULL OR @Expira <= @Ahora OR @Activo = 0
        BEGIN
            -- Token ya usado/vencido o usuario inactivo: se invalida toda la familia (posible robo de token)
            UPDATE TokenRefresco SET FechaRevocado = @Ahora WHERE IDFamilia = @IDFamilia AND FechaRevocado IS NULL;
            COMMIT;
            THROW 50014, N'Sesion invalida. Inicie sesion nuevamente.', 1;
        END

        INSERT INTO TokenRefresco (IDUsuario, IDFamilia, TokenHash, FechaExpira)
        VALUES (@IDUsuario, @IDFamilia, @TokenHashNuevo, @FechaExpiraNueva);
        SET @IDNuevo = SCOPE_IDENTITY();
        UPDATE TokenRefresco SET FechaRevocado = @Ahora, IDReemplazadoPor = @IDNuevo WHERE IDTokenRefresco = @IDToken;
        COMMIT;

        SELECT u.IDUsuario, u.IDRol, r.Nombre AS Rol, u.Correo, u.Nombre
        FROM Usuario u JOIN Rol r ON r.IDRol = u.IDRol WHERE u.IDUsuario = @IDUsuario;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END;
GO

CREATE PROCEDURE SP_Auth_RevocarFamilia         -- logout (idempotente: si el token no existe, no hace nada)
    @TokenHash CHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE t2 SET FechaRevocado = SYSUTCDATETIME()
    FROM TokenRefresco t1
    JOIN TokenRefresco t2 ON t2.IDFamilia = t1.IDFamilia AND t2.FechaRevocado IS NULL
    WHERE t1.TokenHash = @TokenHash;
END;
GO

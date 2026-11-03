/* 001 - Crea la base de datos ShopCart (idempotente) */
USE master;
GO
IF DB_ID(N'ShopCart') IS NULL
    CREATE DATABASE ShopCart COLLATE Modern_Spanish_CI_AS;
GO
-- READ_COMMITTED_SNAPSHOT: los lectores no bloquean a los escritores (rendimiento en listados/reportes)
ALTER DATABASE ShopCart SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
GO

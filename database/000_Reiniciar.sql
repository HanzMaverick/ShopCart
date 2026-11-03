/* 000 - OPCIONAL (solo desarrollo): elimina la base ShopCart para recrearla desde cero */
USE master;
GO
IF DB_ID(N'ShopCart') IS NOT NULL
BEGIN
    ALTER DATABASE ShopCart SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE ShopCart;
END
GO

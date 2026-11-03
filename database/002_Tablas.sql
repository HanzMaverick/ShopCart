/* 002 - Tablas, llaves, constraints e indices. Montos: DECIMAL(18,2). Fechas: DATETIME2 en UTC. */
USE ShopCart;
GO
SET NOCOUNT ON;
GO

/* ===================== RF-01 Autenticacion ===================== */
CREATE TABLE Rol (
    IDRol   TINYINT      NOT NULL CONSTRAINT PK_Rol PRIMARY KEY,
    Nombre  NVARCHAR(30) NOT NULL CONSTRAINT UQ_Rol_Nombre UNIQUE
);

CREATE TABLE Usuario (
    IDUsuario       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Usuario PRIMARY KEY,
    IDRol           TINYINT       NOT NULL CONSTRAINT FK_Usuario_Rol REFERENCES Rol(IDRol),
    Correo          NVARCHAR(256) NOT NULL CONSTRAINT UQ_Usuario_Correo UNIQUE,
    ContrasenaHash  NVARCHAR(100) NOT NULL,
    Nombre          NVARCHAR(150) NOT NULL,
    Activo          BIT           NOT NULL CONSTRAINT DF_Usuario_Activo DEFAULT 1,
    FechaCreacion   DATETIME2(3)  NOT NULL CONSTRAINT DF_Usuario_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Usuario_Correo CHECK (Correo LIKE '%_@_%._%')
);

CREATE TABLE TokenRefresco (
    IDTokenRefresco   BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_TokenRefresco PRIMARY KEY,
    IDUsuario         INT              NOT NULL CONSTRAINT FK_TokenRefresco_Usuario REFERENCES Usuario(IDUsuario),
    IDFamilia         UNIQUEIDENTIFIER NOT NULL,           -- detecta reutilizacion de tokens rotados
    TokenHash         CHAR(64)         NOT NULL CONSTRAINT UQ_TokenRefresco_Hash UNIQUE, -- SHA-256, nunca el token en claro
    FechaCreacion     DATETIME2(3)     NOT NULL CONSTRAINT DF_TokenRefresco_Fecha DEFAULT SYSUTCDATETIME(),
    FechaExpira       DATETIME2(3)     NOT NULL,
    FechaRevocado     DATETIME2(3)     NULL,
    IDReemplazadoPor  BIGINT           NULL CONSTRAINT FK_TokenRefresco_Reemplazo REFERENCES TokenRefresco(IDTokenRefresco)
);
CREATE INDEX IX_TokenRefresco_Usuario ON TokenRefresco(IDUsuario) INCLUDE (IDFamilia, FechaRevocado);
CREATE INDEX IX_TokenRefresco_Familia ON TokenRefresco(IDFamilia);

CREATE TABLE Direccion (
    IDDireccion   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Direccion PRIMARY KEY,
    IDUsuario     INT           NOT NULL CONSTRAINT FK_Direccion_Usuario REFERENCES Usuario(IDUsuario),
    Alias         NVARCHAR(50)  NOT NULL,
    Linea1        NVARCHAR(200) NOT NULL,
    Linea2        NVARCHAR(200) NULL,
    Ciudad        NVARCHAR(100) NOT NULL,
    Departamento  NVARCHAR(100) NOT NULL,
    Telefono      NVARCHAR(20)  NOT NULL,
    Activa        BIT           NOT NULL CONSTRAINT DF_Direccion_Activa DEFAULT 1
);
CREATE INDEX IX_Direccion_Usuario ON Direccion(IDUsuario) WHERE Activa = 1;

/* ===================== RF-02 Catalogo ===================== */
CREATE TABLE Categoria (
    IDCategoria  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Categoria PRIMARY KEY,
    Nombre       NVARCHAR(100) NOT NULL CONSTRAINT UQ_Categoria_Nombre UNIQUE,
    Descripcion  NVARCHAR(500) NULL,
    Activa       BIT           NOT NULL CONSTRAINT DF_Categoria_Activa DEFAULT 1
);

CREATE TABLE Producto (
    IDProducto   INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Producto PRIMARY KEY,
    IDCategoria  INT            NOT NULL CONSTRAINT FK_Producto_Categoria REFERENCES Categoria(IDCategoria),
    Nombre       NVARCHAR(200)  NOT NULL,
    Descripcion  NVARCHAR(2000) NULL,
    Activo       BIT            NOT NULL CONSTRAINT DF_Producto_Activo DEFAULT 1,
    FechaCreacion DATETIME2(3)  NOT NULL CONSTRAINT DF_Producto_Fecha DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_Producto_Categoria ON Producto(IDCategoria) INCLUDE (Nombre, Activo);

CREATE TABLE ImagenProducto (
    IDImagenProducto INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ImagenProducto PRIMARY KEY,
    IDProducto       INT           NOT NULL CONSTRAINT FK_ImagenProducto_Producto REFERENCES Producto(IDProducto),
    Url              NVARCHAR(500) NOT NULL,
    Orden            TINYINT       NOT NULL CONSTRAINT DF_ImagenProducto_Orden DEFAULT 0
);
CREATE INDEX IX_ImagenProducto_Producto ON ImagenProducto(IDProducto);

CREATE TABLE Variante (
    IDVariante          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Variante PRIMARY KEY,
    IDProducto          INT           NOT NULL CONSTRAINT FK_Variante_Producto REFERENCES Producto(IDProducto),
    SKU                 NVARCHAR(50)  NOT NULL CONSTRAINT UQ_Variante_SKU UNIQUE,
    Atributos           NVARCHAR(500) NOT NULL CONSTRAINT DF_Variante_Atributos DEFAULT N'{}', -- {"talla":"M","color":"Rojo"}
    Precio              DECIMAL(18,2) NOT NULL,  -- precio publicado, IVA 12% incluido
    ExistenciaFisica    INT           NOT NULL CONSTRAINT DF_Variante_Fisica DEFAULT 0,
    ExistenciaReservada INT           NOT NULL CONSTRAINT DF_Variante_Reservada DEFAULT 0,
    Activa              BIT           NOT NULL CONSTRAINT DF_Variante_Activa DEFAULT 1,
    CONSTRAINT CK_Variante_Precio     CHECK (Precio >= 0),
    CONSTRAINT CK_Variante_Fisica     CHECK (ExistenciaFisica >= 0),
    CONSTRAINT CK_Variante_Reservada  CHECK (ExistenciaReservada >= 0 AND ExistenciaReservada <= ExistenciaFisica), -- red de seguridad anti-sobreventa
    CONSTRAINT CK_Variante_Atributos  CHECK (ISJSON(Atributos) = 1)
);
CREATE INDEX IX_Variante_Producto ON Variante(IDProducto) INCLUDE (Precio, ExistenciaFisica, ExistenciaReservada, Activa);
CREATE INDEX IX_Variante_Precio ON Variante(Precio) WHERE Activa = 1;

/* ===================== RF-05 Cupones ===================== */
CREATE TABLE Cupon (
    IDCupon              INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Cupon PRIMARY KEY,
    Codigo               NVARCHAR(30)  NOT NULL CONSTRAINT UQ_Cupon_Codigo UNIQUE,
    Tipo                 VARCHAR(12)   NOT NULL,
    Valor                DECIMAL(18,2) NOT NULL,
    MontoMinimo          DECIMAL(18,2) NOT NULL CONSTRAINT DF_Cupon_Minimo DEFAULT 0,
    FechaInicio          DATETIME2(0)  NOT NULL,
    FechaFin             DATETIME2(0)  NOT NULL,
    LimiteUsosTotal      INT           NOT NULL,
    LimiteUsosPorCliente INT           NOT NULL,
    UsosActuales         INT           NOT NULL CONSTRAINT DF_Cupon_Usos DEFAULT 0,
    IDCategoria          INT           NULL CONSTRAINT FK_Cupon_Categoria REFERENCES Categoria(IDCategoria), -- NULL = todo el carrito
    Activo               BIT           NOT NULL CONSTRAINT DF_Cupon_Activo DEFAULT 1,
    CONSTRAINT CK_Cupon_Tipo     CHECK (Tipo IN ('Porcentaje','MontoFijo')),
    CONSTRAINT CK_Cupon_Valor    CHECK (Valor > 0 AND (Tipo <> 'Porcentaje' OR Valor <= 100)),
    CONSTRAINT CK_Cupon_Minimo   CHECK (MontoMinimo >= 0),
    CONSTRAINT CK_Cupon_Vigencia CHECK (FechaFin > FechaInicio),
    CONSTRAINT CK_Cupon_Limites  CHECK (LimiteUsosTotal > 0 AND LimiteUsosPorCliente > 0),
    CONSTRAINT CK_Cupon_Usos     CHECK (UsosActuales >= 0 AND UsosActuales <= LimiteUsosTotal)
);

/* ===================== RF-04 Carrito ===================== */
CREATE TABLE Carrito (
    IDCarrito       INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Carrito PRIMARY KEY,
    IDUsuario       INT              NULL CONSTRAINT FK_Carrito_Usuario REFERENCES Usuario(IDUsuario),
    TokenInvitado   UNIQUEIDENTIFIER NULL,
    IDCupon         INT              NULL CONSTRAINT FK_Carrito_Cupon REFERENCES Cupon(IDCupon),
    Estado          VARCHAR(12)      NOT NULL CONSTRAINT DF_Carrito_Estado DEFAULT 'Activo',
    FechaCreacion   DATETIME2(3)     NOT NULL CONSTRAINT DF_Carrito_Fecha DEFAULT SYSUTCDATETIME(),
    UltimaActividad DATETIME2(3)     NOT NULL CONSTRAINT DF_Carrito_Actividad DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Carrito_Estado   CHECK (Estado IN ('Activo','Convertido','Abandonado')),
    CONSTRAINT CK_Carrito_Duenio   CHECK ((IDUsuario IS NOT NULL AND TokenInvitado IS NULL) OR (IDUsuario IS NULL AND TokenInvitado IS NOT NULL))
);
-- Un solo carrito activo por usuario y por token
CREATE UNIQUE INDEX UX_Carrito_UsuarioActivo ON Carrito(IDUsuario) WHERE IDUsuario IS NOT NULL AND Estado = 'Activo';
CREATE UNIQUE INDEX UX_Carrito_TokenActivo   ON Carrito(TokenInvitado) WHERE TokenInvitado IS NOT NULL AND Estado = 'Activo';
CREATE INDEX IX_Carrito_Actividad ON Carrito(UltimaActividad) WHERE Estado = 'Activo'; -- carritos abandonados

CREATE TABLE CarritoDetalle (
    IDCarritoDetalle INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CarritoDetalle PRIMARY KEY,
    IDCarrito        INT NOT NULL CONSTRAINT FK_CarritoDetalle_Carrito  REFERENCES Carrito(IDCarrito),
    IDVariante       INT NOT NULL CONSTRAINT FK_CarritoDetalle_Variante REFERENCES Variante(IDVariante),
    Cantidad         INT NOT NULL,
    CONSTRAINT CK_CarritoDetalle_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT UQ_CarritoDetalle_Variante UNIQUE (IDCarrito, IDVariante)
);

/* ===================== RF-06 Reservas e idempotencia ===================== */
CREATE TABLE Reserva (
    IDReserva   BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Reserva PRIMARY KEY,
    IDCarrito   INT          NOT NULL CONSTRAINT FK_Reserva_Carrito  REFERENCES Carrito(IDCarrito),
    IDVariante  INT          NOT NULL CONSTRAINT FK_Reserva_Variante REFERENCES Variante(IDVariante),
    Cantidad    INT          NOT NULL,
    FechaCreacion DATETIME2(3) NOT NULL CONSTRAINT DF_Reserva_Fecha DEFAULT SYSUTCDATETIME(),
    FechaExpira DATETIME2(3) NOT NULL,
    Estado      VARCHAR(10)  NOT NULL CONSTRAINT DF_Reserva_Estado DEFAULT 'Activa',
    CONSTRAINT CK_Reserva_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT CK_Reserva_Estado   CHECK (Estado IN ('Activa','Consumida','Liberada','Vencida'))
);
CREATE INDEX IX_Reserva_Vencimiento ON Reserva(FechaExpira) INCLUDE (IDVariante, Cantidad) WHERE Estado = 'Activa';
CREATE INDEX IX_Reserva_Carrito ON Reserva(IDCarrito, Estado);

CREATE TABLE SolicitudPago (
    IDSolicitudPago  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_SolicitudPago PRIMARY KEY,
    IDUsuario        INT              NOT NULL CONSTRAINT FK_SolicitudPago_Usuario REFERENCES Usuario(IDUsuario),
    ClaveIdempotencia UNIQUEIDENTIFIER NOT NULL,   -- la genera el cliente por intento de pago (header Idempotency-Key)
    HashSolicitud    CHAR(64)         NOT NULL,    -- detecta misma clave con contenido distinto
    Estado           VARCHAR(10)      NOT NULL CONSTRAINT DF_SolicitudPago_Estado DEFAULT 'EnProceso',
    IDPedido         INT              NULL,        -- FK se agrega despues de crear Pedido
    FechaCreacion    DATETIME2(3)     NOT NULL CONSTRAINT DF_SolicitudPago_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_SolicitudPago_Clave UNIQUE (IDUsuario, ClaveIdempotencia),
    CONSTRAINT CK_SolicitudPago_Estado CHECK (Estado IN ('EnProceso','Completada','Fallida'))
);

/* ===================== RF-06/07 Pedidos ===================== */
CREATE TABLE EstadoPedido (
    IDEstadoPedido TINYINT      NOT NULL CONSTRAINT PK_EstadoPedido PRIMARY KEY,
    Nombre         NVARCHAR(30) NOT NULL CONSTRAINT UQ_EstadoPedido_Nombre UNIQUE,
    CuentaComoVenta BIT         NOT NULL   -- 0 = excluido de reportes (Cancelado)
);

CREATE TABLE TransicionEstadoPedido (
    IDEstadoOrigen  TINYINT NOT NULL CONSTRAINT FK_Transicion_Origen  REFERENCES EstadoPedido(IDEstadoPedido),
    IDEstadoDestino TINYINT NOT NULL CONSTRAINT FK_Transicion_Destino REFERENCES EstadoPedido(IDEstadoPedido),
    CONSTRAINT PK_TransicionEstadoPedido PRIMARY KEY (IDEstadoOrigen, IDEstadoDestino),
    CONSTRAINT CK_Transicion_Distintos CHECK (IDEstadoOrigen <> IDEstadoDestino)
);

CREATE TABLE Pedido (
    IDPedido        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Pedido PRIMARY KEY,
    NumeroPedido    AS (N'SC-' + RIGHT(N'00000000' + CAST(IDPedido AS NVARCHAR(10)), 8)) PERSISTED,
    IDUsuario       INT           NOT NULL CONSTRAINT FK_Pedido_Usuario REFERENCES Usuario(IDUsuario),
    IDEstadoPedido  TINYINT       NOT NULL CONSTRAINT FK_Pedido_Estado  REFERENCES EstadoPedido(IDEstadoPedido),
    IDCupon         INT           NULL CONSTRAINT FK_Pedido_Cupon REFERENCES Cupon(IDCupon),
    CodigoCupon     NVARCHAR(30)  NULL,
    -- Direccion congelada al momento de la compra
    DireccionEnvio  NVARCHAR(600) NOT NULL,
    TelefonoContacto NVARCHAR(20) NOT NULL,
    Subtotal        DECIMAL(18,2) NOT NULL,  -- suma de lineas, IVA incluido
    Descuento       DECIMAL(18,2) NOT NULL CONSTRAINT DF_Pedido_Descuento DEFAULT 0,
    Total           DECIMAL(18,2) NOT NULL,
    MontoIVA        DECIMAL(18,2) NOT NULL,  -- IVA contenido en Total (12%)
    FechaCreacion   DATETIME2(3)  NOT NULL CONSTRAINT DF_Pedido_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Pedido_Montos CHECK (Subtotal >= 0 AND Descuento >= 0 AND Descuento <= Subtotal AND Total = Subtotal - Descuento AND MontoIVA >= 0)
);
CREATE UNIQUE INDEX UX_Pedido_Numero ON Pedido(NumeroPedido);
CREATE INDEX IX_Pedido_Usuario ON Pedido(IDUsuario, FechaCreacion DESC) INCLUDE (IDEstadoPedido, Total);
CREATE INDEX IX_Pedido_Estado_Fecha ON Pedido(IDEstadoPedido, FechaCreacion DESC) INCLUDE (IDUsuario, Total);
CREATE INDEX IX_Pedido_Fecha ON Pedido(FechaCreacion) INCLUDE (IDEstadoPedido, Total);

ALTER TABLE SolicitudPago ADD CONSTRAINT FK_SolicitudPago_Pedido FOREIGN KEY (IDPedido) REFERENCES Pedido(IDPedido);
CREATE UNIQUE INDEX UX_SolicitudPago_Pedido ON SolicitudPago(IDPedido) WHERE IDPedido IS NOT NULL;

CREATE TABLE PedidoDetalle (
    IDPedidoDetalle  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PedidoDetalle PRIMARY KEY,
    IDPedido         INT           NOT NULL CONSTRAINT FK_PedidoDetalle_Pedido   REFERENCES Pedido(IDPedido),
    IDVariante       INT           NOT NULL CONSTRAINT FK_PedidoDetalle_Variante REFERENCES Variante(IDVariante),
    SKU              NVARCHAR(50)  NOT NULL,   -- snapshot
    NombreProducto   NVARCHAR(200) NOT NULL,   -- snapshot
    Atributos        NVARCHAR(500) NOT NULL,   -- snapshot
    PrecioUnitario   DECIMAL(18,2) NOT NULL,   -- precio congelado
    Cantidad         INT           NOT NULL,
    DescuentoLinea   DECIMAL(18,2) NOT NULL CONSTRAINT DF_PedidoDetalle_Desc DEFAULT 0, -- descuento prorrateado
    Subtotal         DECIMAL(18,2) NOT NULL,
    CantidadDevuelta INT           NOT NULL CONSTRAINT DF_PedidoDetalle_Dev DEFAULT 0,
    CONSTRAINT CK_PedidoDetalle_Cantidad  CHECK (Cantidad > 0),
    CONSTRAINT CK_PedidoDetalle_Devuelta  CHECK (CantidadDevuelta >= 0 AND CantidadDevuelta <= Cantidad), -- no devolver mas de lo vendido
    CONSTRAINT CK_PedidoDetalle_Montos    CHECK (PrecioUnitario >= 0 AND DescuentoLinea >= 0 AND Subtotal = PrecioUnitario * Cantidad - DescuentoLinea AND Subtotal >= 0),
    CONSTRAINT UQ_PedidoDetalle_Variante  UNIQUE (IDPedido, IDVariante)
);
CREATE INDEX IX_PedidoDetalle_Variante ON PedidoDetalle(IDVariante) INCLUDE (IDPedido, Cantidad, CantidadDevuelta, Subtotal);

CREATE TABLE PedidoHistorialEstado (
    IDPedidoHistorialEstado BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PedidoHistorialEstado PRIMARY KEY,
    IDPedido          INT          NOT NULL CONSTRAINT FK_PedidoHist_Pedido  REFERENCES Pedido(IDPedido),
    IDEstadoAnterior  TINYINT      NULL CONSTRAINT FK_PedidoHist_Anterior REFERENCES EstadoPedido(IDEstadoPedido),
    IDEstadoNuevo     TINYINT      NOT NULL CONSTRAINT FK_PedidoHist_Nuevo REFERENCES EstadoPedido(IDEstadoPedido),
    IDUsuario         INT          NOT NULL CONSTRAINT FK_PedidoHist_Usuario REFERENCES Usuario(IDUsuario),
    Fecha             DATETIME2(3) NOT NULL CONSTRAINT DF_PedidoHist_Fecha DEFAULT SYSUTCDATETIME(),
    Comentario        NVARCHAR(500) NULL
);
CREATE INDEX IX_PedidoHist_Pedido ON PedidoHistorialEstado(IDPedido, Fecha);

CREATE TABLE Pago (
    IDPago      INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Pago PRIMARY KEY,
    IDPedido    INT           NOT NULL CONSTRAINT FK_Pago_Pedido REFERENCES Pedido(IDPedido),
    Metodo      VARCHAR(20)   NOT NULL,
    Referencia  NVARCHAR(100) NOT NULL,
    Monto       DECIMAL(18,2) NOT NULL,
    Estado      VARCHAR(12)   NOT NULL,
    Fecha       DATETIME2(3)  NOT NULL CONSTRAINT DF_Pago_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Pago_Monto  CHECK (Monto > 0),
    CONSTRAINT CK_Pago_Estado CHECK (Estado IN ('Aprobado','Rechazado','Reembolsado')),
    CONSTRAINT UQ_Pago_Referencia UNIQUE (Referencia)
);
CREATE INDEX IX_Pago_Pedido ON Pago(IDPedido);

CREATE TABLE CuponUso (
    IDCuponUso INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_CuponUso PRIMARY KEY,
    IDCupon    INT          NOT NULL CONSTRAINT FK_CuponUso_Cupon   REFERENCES Cupon(IDCupon),
    IDUsuario  INT          NOT NULL CONSTRAINT FK_CuponUso_Usuario REFERENCES Usuario(IDUsuario),
    IDPedido   INT          NOT NULL CONSTRAINT FK_CuponUso_Pedido  REFERENCES Pedido(IDPedido),
    Fecha      DATETIME2(3) NOT NULL CONSTRAINT DF_CuponUso_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_CuponUso_Pedido UNIQUE (IDPedido)   -- un cupon por pedido
);
CREATE INDEX IX_CuponUso_CuponUsuario ON CuponUso(IDCupon, IDUsuario);

/* ===================== RF-07 Devoluciones ===================== */
CREATE TABLE Devolucion (
    IDDevolucion INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Devolucion PRIMARY KEY,
    IDPedido     INT           NOT NULL CONSTRAINT FK_Devolucion_Pedido  REFERENCES Pedido(IDPedido),
    IDUsuario    INT           NOT NULL CONSTRAINT FK_Devolucion_Usuario REFERENCES Usuario(IDUsuario), -- quien la registra
    Motivo       NVARCHAR(500) NOT NULL,
    MontoReembolsado DECIMAL(18,2) NOT NULL,
    Fecha        DATETIME2(3)  NOT NULL CONSTRAINT DF_Devolucion_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Devolucion_Monto CHECK (MontoReembolsado >= 0)
);
CREATE INDEX IX_Devolucion_Pedido ON Devolucion(IDPedido) INCLUDE (Fecha, MontoReembolsado);

CREATE TABLE DevolucionDetalle (
    IDDevolucionDetalle INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_DevolucionDetalle PRIMARY KEY,
    IDDevolucion    INT NOT NULL CONSTRAINT FK_DevDetalle_Devolucion REFERENCES Devolucion(IDDevolucion),
    IDPedidoDetalle INT NOT NULL CONSTRAINT FK_DevDetalle_PedidoDetalle REFERENCES PedidoDetalle(IDPedidoDetalle),
    Cantidad        INT NOT NULL,
    CONSTRAINT CK_DevDetalle_Cantidad CHECK (Cantidad > 0),
    CONSTRAINT UQ_DevDetalle UNIQUE (IDDevolucion, IDPedidoDetalle)
);

/* ===================== RF-03 Kardex ===================== */
CREATE TABLE Kardex (
    IDKardex            BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Kardex PRIMARY KEY,
    IDVariante          INT           NOT NULL CONSTRAINT FK_Kardex_Variante REFERENCES Variante(IDVariante),
    TipoMovimiento      VARCHAR(10)   NOT NULL,
    Cantidad            INT           NOT NULL,   -- con signo: entradas/devoluciones (+), salidas (-), ajustes (+/-)
    ExistenciaResultante INT          NOT NULL,
    Motivo              NVARCHAR(300) NOT NULL,
    IDUsuario           INT           NOT NULL CONSTRAINT FK_Kardex_Usuario REFERENCES Usuario(IDUsuario),
    IDPedido            INT           NULL CONSTRAINT FK_Kardex_Pedido REFERENCES Pedido(IDPedido),
    Fecha               DATETIME2(3)  NOT NULL CONSTRAINT DF_Kardex_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Kardex_Tipo     CHECK (TipoMovimiento IN ('Entrada','Salida','Ajuste','Devolucion')),
    CONSTRAINT CK_Kardex_Cantidad CHECK (Cantidad <> 0),
    CONSTRAINT CK_Kardex_Signo    CHECK ((TipoMovimiento IN ('Entrada','Devolucion') AND Cantidad > 0) OR (TipoMovimiento = 'Salida' AND Cantidad < 0) OR TipoMovimiento = 'Ajuste'),
    CONSTRAINT CK_Kardex_Resultante CHECK (ExistenciaResultante >= 0),
    CONSTRAINT CK_Kardex_Motivo   CHECK (LEN(LTRIM(RTRIM(Motivo))) > 0)
);
CREATE INDEX IX_Kardex_Variante ON Kardex(IDVariante, Fecha DESC) INCLUDE (Cantidad, ExistenciaResultante);
CREATE INDEX IX_Kardex_Pedido ON Kardex(IDPedido) WHERE IDPedido IS NOT NULL;

/* ===================== RF-09 Bitacora ===================== */
CREATE TABLE Bitacora (
    IDBitacora    BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Bitacora PRIMARY KEY,
    Modulo        VARCHAR(20)   NOT NULL,
    Entidad       VARCHAR(40)   NOT NULL,
    IDEntidad     INT           NOT NULL,
    Accion        VARCHAR(15)   NOT NULL,
    ValorAnterior NVARCHAR(MAX) NULL,   -- JSON
    ValorNuevo    NVARCHAR(MAX) NULL,   -- JSON
    IDUsuario     INT           NOT NULL CONSTRAINT FK_Bitacora_Usuario REFERENCES Usuario(IDUsuario),
    Fecha         DATETIME2(3)  NOT NULL CONSTRAINT DF_Bitacora_Fecha DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Bitacora_Modulo CHECK (Modulo IN ('Catalogo','Precios','Inventario','Cupones','Pedidos','Usuarios')),
    CONSTRAINT CK_Bitacora_Accion CHECK (Accion IN ('Creacion','Modificacion','Desactivacion')),
    CONSTRAINT CK_Bitacora_JsonAnt CHECK (ValorAnterior IS NULL OR ISJSON(ValorAnterior) = 1),
    CONSTRAINT CK_Bitacora_JsonNue CHECK (ValorNuevo IS NULL OR ISJSON(ValorNuevo) = 1)
);
CREATE INDEX IX_Bitacora_Modulo_Fecha ON Bitacora(Modulo, Fecha DESC) INCLUDE (Entidad, IDEntidad, Accion, IDUsuario);
GO

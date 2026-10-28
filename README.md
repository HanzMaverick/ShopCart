# ShopCart
Plataforma web de ventas de nivel productivo, con base de datos, API y frontend. Desarrollada con Node.js para BackEnd, React para FrontEnd y SQL Server 25 como BD.

BackEnd;
Gestion de dependencias y seguridad (pnpm)
pnpm en lugar de npm: estricto con dependencias no declaradas, y desde pnpm 10 no ejecuta scripts de instalacion de terceros salvo los aprobados.
Unico aprobado: esbuild (lo usa tsx) en allowBuilds de pnpm-workspace.yaml. bcryptjs es JS puro: no necesita compilar nada.
Versiones exactas (saveExact) y pnpm-lock.yaml versionado. Instalacion reproducible con --frozen-lockfile.
minimumReleaseAge: 10080 (7 dias): pnpm rechaza versiones recien publicadas. En la practica bloqueo mssql@12.7.13 y dotenv@18.0.9 (publicadas dias antes) y se fijaron 12.7.10 y 18.0.8.

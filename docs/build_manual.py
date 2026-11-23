from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from pathlib import Path

OUT = Path(__file__).resolve().parent / "BauMar_documentacion_tecnica.docx"
doc = Document()
sec = doc.sections[0]
sec.top_margin = Inches(.58); sec.bottom_margin = Inches(.58)
sec.left_margin = Inches(.78); sec.right_margin = Inches(.78)

styles = doc.styles
styles['Normal'].font.name = 'Aptos'; styles['Normal'].font.size = Pt(9)
styles['Normal'].font.color.rgb = RGBColor(42, 52, 63)
for name, size in [('Title', 27), ('Heading 1', 18), ('Heading 2', 12)]:
    styles[name].font.name = 'Aptos Display'; styles[name].font.size = Pt(size)
    styles[name].font.color.rgb = RGBColor(0, 0, 0)
styles['Title'].font.underline = False
title_ppr = styles['Title']._element.get_or_add_pPr()
for border in title_ppr.findall(qn('w:pBdr')):
    title_ppr.remove(border)

def shade(cell, fill):
    tcPr = cell._tc.get_or_add_tcPr(); shd = OxmlElement('w:shd'); shd.set(qn('w:fill'), fill); tcPr.append(shd)

def footer_number(paragraph):
    paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    r = paragraph.add_run('BAUMAR  •  DOCUMENTACIÓN TÉCNICA  |  '); r.font.size = Pt(8); r.font.color.rgb = RGBColor(95, 105, 115)
    fld = OxmlElement('w:fldSimple'); fld.set(qn('w:instr'), 'PAGE'); paragraph._p.append(fld)
footer_number(sec.footer.paragraphs[0])

def p(text='', boldlead=None):
    para = doc.add_paragraph()
    if boldlead and text.startswith(boldlead):
        para.add_run(boldlead).bold = True; para.add_run(text[len(boldlead):])
    else: para.add_run(text)
    para.paragraph_format.space_after = Pt(4)
    return para

def bullets(items):
    for item in items:
        para = doc.add_paragraph(style='List Bullet'); para.add_run(item); para.paragraph_format.space_after = Pt(2)

def table(headers, rows):
    t = doc.add_table(rows=1, cols=len(headers)); t.alignment = WD_TABLE_ALIGNMENT.CENTER; t.style = 'Table Grid'
    for i, h in enumerate(headers):
        c=t.rows[0].cells[i]; c.text=h; shade(c,'DCEAF2'); c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
        for run in c.paragraphs[0].runs: run.bold=True; run.font.size=Pt(8.5)
    for row in rows:
        cells=t.add_row().cells
        for i, value in enumerate(row):
            cells[i].text=value; cells[i].vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            for para in cells[i].paragraphs:
                for run in para.runs: run.font.size=Pt(8)
    doc.add_paragraph().paragraph_format.space_after=Pt(1)

title=doc.add_paragraph(style='Title'); title.add_run('BauMar sistema de gestión para taller')
sub=doc.add_paragraph(); sub.add_run('Documentación funcional y técnica · 7 de octubre de 2026').italic=True
p('Esta guía describe qué hace la primera versión del sistema, cómo se conectan sus componentes, cómo iniciar el entorno local y cómo verificar sus funciones. La aplicación separa acceso, administración, taller, clientes y consulta de vehículos; los módulos futuros pueden añadirse sin conectar el navegador directamente a MySQL.')
table(['🧭 Área','📌 Alcance actual'],[
('Acceso','Login como pantalla inicial; registro, configuración inicial y recuperación.'),
('Administración','Usuarios, catálogo de roles y asignación restringida a administrador.'),
('Taller','Alta, dirección mexicana, imagen, estatus y conteo de visitas.'),
('Clientes','Alta por administrador/recepcionista, siempre vinculada a taller.'),
('Vehículos','Consulta de estatus y bitácora preparada para cliente.'),
('Operación','MySQL en Docker, logs locales y diagramas por fase.')])

doc.add_heading('🚀 1. Requisitos y puesta en marcha', level=1)
p('Se requiere Node.js 20 o superior, pnpm 11.25.0 y PowerShell. BauMar es independiente de otros proyectos en la carpeta de trabajo. Copia .env.example a .env y configura secretos propios y una conexión MySQL disponible.')
table(['Paso','Comando PowerShell','Comprobación'],[
('Dependencias','pnpm install --frozen-lockfile','Instalación completada sin errores.'),
('Configurar entorno','Copy-Item .env.example .env','JWT_SECRET de al menos 32 caracteres y contraseñas propias.'),
('Base de datos','Configurar DB_HOST, DB_PORT, DB_NAME, DB_USER y DB_PASSWORD','MySQL accesible con el usuario de aplicación.'),
('API y web','pnpm dev','API en 4000 y frontend en 5173.'),
('Salud','Invoke-RestMethod http://localhost:4000/api/health','status ok y database connected.')])
p('El esquema inicial se encuentra en server/sql/schema.sql. Los cambios posteriores se aplican con migraciones versionadas de server/sql/migrations. No borres volúmenes con información real para “reiniciar” el esquema.')

doc.add_heading('🔐 2. Acceso, registro y recuperación', level=1)
p('Al abrir la aplicación, la vista visible es Login. Incluye usuario/correo, contraseña, botón Login y enlaces para recuperar acceso o crear cuenta. Si todavía no hay administrador, el dueño abre http://localhost:5173/?view=setup para crear la primera cuenta; esta configuración sigue habilitada aunque ya existan clientes. El restablecimiento emite un token aleatorio de un solo uso con caducidad; la respuesta pública no confirma si el correo está registrado.')
p('Las contraseñas se derivan con PBKDF2-HMAC-SHA512, sal aleatoria individual y comparación de tiempo constante. Esto cumple el algoritmo SHA-512 solicitado, con endurecimiento mediante iteraciones y sal. No se usa SHA-512 simple ni cifrado reversible. Los tokens de recuperación se guardan como huellas SHA-512; el token en claro no se persiste.')

doc.add_heading('👥 3. Usuarios, roles y permisos', level=1)
bullets([
'Usuarios: consulta, alta, edición y activación/desactivación; las cuentas creadas desde administración quedan sin rol hasta asignación explícita.',
'Roles: crea únicamente entradas del catálogo. Restricciones UNIQUE impiden nombres o claves duplicadas; crear un rol no lo asigna.',
'Administración de roles: asignar/quitar roles es una operación separada. La API exige el rol administrator en cada petición protegida.',
'Clientes: administración y recepción consultan y registran clientes en el módulo dedicado; el servidor exige taller activo y sesión autorizada.',
'Recepcionista, asesor, técnico y cliente no pueden asignar roles aunque invoquen manualmente la API.'
])
table(['Rol','Permiso relevante'],[
('Administrador/dueño','Administra usuarios y roles; alta de taller y cliente; consulta visitas.'),
('Recepcionista','Alta de clientes vinculados a taller; no asigna roles.'),
('Asesor de servicio','Sin permiso de asignación de roles.'),
('Técnico','Consulta el estado del vehículo que le corresponde; no asigna roles.'),
('Cliente','Consulta el estatus de sus vehículos; no administra cuentas.'),
('Sistema','Identidad técnica prevista; no es una sesión interactiva.')])

doc.add_heading('🏢 4. Talleres, dirección e imagen', level=1)
p('El formulario pide nombre, RFC, correo Gmail de contacto, imagen, calle, número, colonia, código postal, estado y municipio. Solo admite JPEG, PNG o WebP, valida tipo real mediante firma, y limita el archivo al valor MAX_WORKSHOP_IMAGE_MB (5 MB por defecto). El nombre normalizado y el RFC son únicos, para impedir talleres duplicados.')
p('El selector de dirección consulta el catálogo SEPOMEX: el código postal muestra estado, municipio y colonias relacionadas; al elegir estado/municipio/colonia se puede consultar el catálogo para encontrar los códigos postales coincidentes. La disponibilidad depende del proveedor externo y conexión de red. Verifica la dirección antes de guardar.')
p('El administrador ve el conteo de entradas registradas al taller. El historial individual para que una persona vea talleres visitados queda preparado como fase futura. Los eventos de visita requieren sesión autenticada.')

doc.add_heading('🚗 5. Clientes y estatus de vehículos', level=1)
p('Solo administrador y recepcionista con sesión válida pueden dar de alta clientes. Cada registro debe estar asociado a un taller activo existente; el backend valida la relación y rechaza el alta si falta. Los campos son nombre, teléfono de contacto, dirección y correo. El portal del cliente se vincula por correo cuando existe una cuenta activa con rol cliente.')
p('El módulo de vehículos permite asociar UUID de cliente, taller y técnico; mantiene historial de estados del vehículo y muestra al cliente únicamente sus vehículos. La primera etapa registra estados y notas de avance, sin ampliar el alcance a órdenes, citas ni cobros.')
table(['Estado','Uso'],[('Activo','Disponible para operación normal.'),('Inactivo','Conservado, pero fuera de operación.'),('Eliminado','Baja lógica; conserva referencias e historial.')])

doc.add_heading('🧱 6. Arquitectura y patrones', level=1)
table(['Patrón','Implementación','Responsabilidad'],[
('Factory Method','server/src/factories/UserFactory.js','Crea perfiles concretos de sistema según roles controlados; evita elegir tablas desde entrada externa.'),
('Adapter','src/adapters/httpAdapter.js','Adapta fetch, encabezados, JSON y errores HTTP a una interfaz estable.'),
('Facade','src/facades/BauMarFacade.js','Expone operaciones del producto y coordina servicios/token sin detalles HTTP en componentes.'),
('Strategy','src/strategies/ViewStrategy.js','Selecciona comportamiento/render de vista por sección sin modificar el shell principal.')])
p('La ruta de datos es React → Facade → Adapter → API REST → ruta/controlador → servicio/modelo → MySQL. Express no expone credenciales al navegador. Las operaciones de negocio usan JSON y las sesiones protegidas envían Bearer JWT.')

doc.add_heading('🗃️ 7. Datos e identificadores', level=1)
p('Las tablas principales cubren usuarios, roles, asignaciones, estados, perfiles, talleres, visitas, clientes, vehículos, historial de vehículos y tokens de recuperación. Las entidades relacionadas al taller usan llaves foráneas e índices. IDs se generan en Node como UUIDv7, con versión 7 y variante RFC; no existe AUTO_INCREMENT. status_id apunta al catálogo compartido activo/inactivo/eliminado.')
table(['Dato','Regla técnica'],[
('Identificadores','UUIDv7 CHAR(36) generados por backend.'),('Roles','UNIQUE(role_key), UNIQUE(role_name), UNIQUE(user_id, role_id).'),
('Estados','Catálogo independiente con FK y valores activos, inactivos y eliminados.'),
('Taller','Nombre normalizado y RFC con restricciones de unicidad.'),('Cliente','FK obligatoria a taller; soft delete con catálogo de estados.')])

doc.add_heading('🛡️ 8. Validaciones, errores y logs', level=1)
p('React brinda validación temprana con expresiones regulares y límites de longitud. El backend repite validaciones y autorización para que solicitudes directas no puedan omitirlas. Los errores muestran un mensaje claro y un folio de seguimiento. El middleware registra JSON por línea en server/logs/application.log con fecha, módulo, ruta, método, usuario conocido, mensaje técnico y folio. No registra contraseñas, hashes ni tokens.')
p('Las imágenes se sirven desde almacenamiento local excluido de Git. Antes de exponer el sistema, usa almacenamiento gestionado, HTTPS, restricciones de intentos, política CSP, secretos robustos y proveedor transaccional para recuperación por correo.')

doc.add_heading('🧪 9. Verificación funcional', level=1)
table(['Prueba','Resultado esperado'],[
('Pruebas backend: node --test server/test/core.test.js','10 pruebas pasan: UUIDv7, PBKDF2-SHA512, factory, validación, seguridad de rol, estados, taller, cliente y setup de administrador.'),
('Compilación: .\\node_modules\\.bin\\vite.cmd build','Vite genera dist sin errores.'),
('GET /api/health','200 y base conectada.'),
('Alta de usuario normal','Se crea sin rol asignado.'),
('Duplicar un rol','409; el catálogo permanece único.'),
('Asignación por usuario no administrador','403 desde backend.'),
('Alta cliente sin taller','Rechazada; no hay fila sin vínculo.'),
('Cliente con rol permitido','Puede consultar únicamente su estado vehicular.')])

doc.add_heading('📂 10. Archivos de referencia', level=1)
bullets([
'README.md: inicio rápido, variables y catálogo de endpoints.',
'docs/desarrollo-paso-a-paso.md: 31 etapas con archivos, comandos y comprobaciones.',
'docs/diagramas/: especificaciones JSON detalladas por fase y sus diagramas Archify exportados.',
'server/sql/schema.sql y server/sql/migrations/: estructura inicial y evolución de MySQL.',
'server/test/core.test.js: comprobaciones automatizadas del núcleo.'
])
p('Fases diagramadas: 01 acceso y sesión; 02 usuarios y autorización; 03 alta de taller; 04 clientes y visitas; 05 estado de vehículos; 06 errores, estados y logs. Cada fase describe actores, límites de autorización, validación, persistencia y errores relevantes.')

doc.save(OUT)
print(OUT)

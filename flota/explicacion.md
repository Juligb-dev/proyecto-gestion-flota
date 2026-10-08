# Explicación — Chequeo de Flota

## 1. ¿Qué es esto?

Es una app para **checquear vehículos**. Un chofer carga los datos de su auto
(patente y kilometraje), marca Sí/No una lista de 10 cosas para revisar, y al final se
guarda el resultado. Después el **admin** puede ver todo: el historial de las revisiones,
bajarlo a planilla (CSV) y ver estadísticas de las fallas.

 La info se guarda en el navegador del usuario con
`localStorage`. Abrís el `index.html` y ya anda.


## 2. Archivos del proyecto

```
flota/
├── index.html     ← toda la página: el HTML + el JavaScript adentro
├── style.css      ← todos los estilos (colores, tamaños, modo oscuro)
└── explicacion.md ← este archivo
```

## 3. Recorrida completa, paso a paso

### Arranca en el login

La primera pantalla pide **DNI** y **contraseña**. Tenés dos botones y un link:
                                                
------------------------------------------------------------|
| **Iniciar sesión** | Busca si ese DNI+contraseña ya está guardado. Si está, entra. Si no, te dice "DNI o contraseña incorrectos". la idea seria tener un authenticator para detectar los login |
| **Registrarme**  | Te crea al usuario con los datos que acabás de poner y entra directo. Si el DNI ya existe, te avisa. |
| **Admin panel**  | Te pide una contraseña aparte. Si es correcta, entrás como admin. |

### La barra de navegación

Una vez que entrás aparece una barrita azul arriba. La arma el JavaScript solito
(`armarNav()`) y los botones **dependen de quién sos**:

- **Conductor normal:** "Nueva checklist" y "Salir".
- **Admin:** además "Historial" y "Estadísticas".

Si tocás "Salir" se borra la sesión, se limpia el formulario y volvés al login.


### Paso 1 — Cargar vehículo

| Campo           | Notas                                                        |
|-----------------|--------------------------------------------------------------|
| DNI conductor   | Va solo, ya quedó cargado con quién entró.                  |
| Patente         | Ej: `AB123CD`. Se pasa a MAYÚSCULAS automático.              |
| Kilometraje     | Número.                                                      |
| Fecha y hora     | La pone el sistema solo, no se puede editar.                |

Si apretás "Guardar datos y continuar" sin patente o sin km, te salta un `alert` diciendo
que completes. No te deja pasar.


### Paso 2 — El checklist

Acá se dibujan los 10 ítems a controlar, con dos radio buttons: **Sí** y **No**.

```
Luces               (Sí)  (No)      ← Sí viene marcado por defecto
Frenos              (Sí)  (No)
Neumáticos          (Sí)  (No)
Espejos             (Sí)  (No)
Combustible         (Sí)  (No)
Documentación       (Sí)  (No)
Botiquín            (Sí)  (No)
Extintor            (Sí)  (No)
Limpiaparabrisas    (Sí)  (No)
Aceite y agua       (Sí)  (No)
```

Cada ítem se dibuja con un `for` (bueno, con `.map()`), o sea que la lista de arriba es
una sola línea de código en la constante `ITEMS`. Si querés agregar o sacar un ítem, tocá
esa lista y se actualiza **todo**: el checklist, el resumen, la tabla del historial, el
CSV y las estadísticas. No hay que cambiar nada más.

Cuando estás conforme le das "Ver resumen".


### Paso 3 — Resumen

Te muestra los datos del vehículo arriba (patente, km, fecha) y abajo los 10 ítems con
tu respuesta. Los que marcaste **No** salen en **rojo y en negrita** (clase `.no`), para
que los veas al toque.

- **Volver** → te devuelve al checklist por si te equivocaste en algo.
- **Guardar checklist** → la escribe en el historial, te avisa con un `alert` y arranca una
  checklist nueva automáticamente.


### Historial (solo admin)

Una tabla con **una fila por revisión** y estas columnas:

`Fecha | DNI | Patente | Km | Luces | Frenos | Neumáticos | ... | Aceite y agua`

O sea, las 4 primeras son los datos del auto y después hay una columna por cada ítem del
checklist. Las respuestas "No" van en rojo.

Si no hay nada cargado todavía sale el cartel "Todavía no hay registros."

**"Descargar CSV"** te baja un archivo llamado `historial_flota.csv` que podés abrir con
Excel o Google Sheets. Dos detalles que se suelen pasar: los separadores van con **`;`** y no con
coma, porque en español la coma es el separador de decimales y Excel se hace un bollo.
Además le mete un **BOM** (el `\uFEFF` ese raro) para que las tildes y la ñ no salgan
raras.


### Estadísticas (solo admin)

Cuatro cosas:

1. **Total de checklists** cuántas se hicieron en total.
2. **Vehículos distintos** cuántas patentes diferentes hay (cuenta únicas, no repetidas).
3. **Checklists con alguna falla** cuántas tienen al menos un "No", con el porcentaje.
4. **Fallas por ítem** la lista de los 10 ítems con cuántas veces falló cada uno. Los que
   tienen fallas salen en rojo.

Sirve para ver qué es lo que más se rompe en la flota y qué conviene revisar primero.


## 5. Dónde se guardan los datos

Todo vive en el `localStorage` del navegador, con dos llaves:

| Llave       | Qué guarda                                                    |
|-------------|---------------------------------------------------------------|
| `usuarios`  | Lista de usuarios: `{ dni, pass }`                            |
| `historial` | Lista de revisiones: `{ dni, patente, km, fecha, items[] }`    |

Dos cosas importantes que conviene saber:

- **Los datos son por navegador.** Si revisás la misma patente en el celu y en la compu,
  no se ven entre sí. Cada dispositivo tiene su propia lista.
- **Si borrás los datos del navegador o usás incógnito, se pierde todo.** No hay copia
  en ningún lado. Para una demo o una práctica está bien; para producción, no.

El acceso a esas dos llaves está metido en dos funciones chiquitas, `leer()` y `guardar()`,
envueltas en `try/catch` para que si el navegador bloquea el almacenamiento (modo
privado, o sin espacio) la página no se rompa y siga andando.


## 6. La contraseña del admin

Está escrita en el `index.html`, en la función `admin()`:

```js
if (c === "admin123") { ... }
```

Es `admin123`. Se escribe en texto plano adentro del prompt del navegador.

Sirve para mostrar el flujo, no para cuidar nada. Cualquiera que abra el código fuente
de la página (clic derecho → "ver código") la ve. En una versión real esto tendría que
vivir en un servidor, nunca en el HTML.


## 7. Cómo está armado el CSS

`style.css` está partido en 8 bloques, con un comentario arriba de cada uno. Todos los
colores salen de **variables CSS** definidas arriba, así que cambiar el tema entero es
tocar 6 líneas nomás:

```css
--bg    fondo de la página
--card  fondo de las tarjetas blancas
--tx    color del texto
--bd    color de los bordes
--ac    color de acento (barra azul, botón principal)
--gris  botón secundario
--no    rojo de las fallas
```

**Modo oscuro:** el navegador avisa si tu sistema está en oscuro (`prefers-color-scheme`)
y el CSS cambia las variables solo, sin escribir una sola línea de JavaScript. También
hay un override manual: si le ponés `data-theme="dark"` al `<html>`, se fuerza oscuro; con
`data-theme="light"` se fuerza claro y pisa la preferencia del sistema.

**Celulares:** el `viewport` lleva `viewport-fit=cover` y el CSS usa
`env(safe-area-inset-*)`, que es lo que hace que en un iPhone con notch el contenido no te
quede debajo de la muesca ni del cuadradito de la barra de inicio.

**La tabla del historial** tiene 14 columnas, o sea que en pantalla angosta no entra. Por
eso está envuelta en un `<div class="wrap">` que tiene `overflow-x: auto` y te deja
deslizarla con el dedo.


## 8. Cómo se muestran y esconden las pantallas

Hay 6 secciones en el HTML, cada una con un `id`: `login`, `p1`, `p2`, `p3`, `hist`, `stats`.

Todas arrancan con la clase `hide`, que en el CSS es literalmente `display: none`.
Después la función `mostrar()` hace todo el trabajo:

```js
function mostrar(id) {
  PAGES.forEach(p => $(p).classList.toggle("hide", p !== id));
}
```

`PAGES` es la lista de los 6 ids. La función le pone `hide` a todos menos al que le
pediste, y le saca `hide` al elegido. O sea, mostrar una pantalla es agregar y quitar
clases, nada más. Por eso el HTML y el JavaScript andan tan pegados: cada `id` del HTML
tiene que existir y coincidir con lo que busca el script.


## 9. Cosas a tener en cuenta

- **Contraseñas en texto plano** dentro del `localStorage`. Se leen con abrir las
  herramientas de desarrollo.
- **El admin es una contraseña escrita en el código**, no un usuario real.(HARDCODE)
- **Los datos son del navegador**, no hay nada compartido ni respaldado.
- **`innerHTML` con lo que escribe el usuario**: la patente y el DNI se inyectan directo
  en el HTML sin escapar. Con caracteres raros se rompe el dibujo de la pantalla.
  pantalla. Si esto se usa de verdad, hay que escapar los textos o usar `textContent`.
- **No hay borrado de historial.** Una vez guardada una revisión, no se puede sacar desde
  la interfaz. Habría que abrir las herramientas de desarrollo y borrar el `localStorage`
  a mano.


## 10. Ideas para seguir

- **Borrar el historial** con un botón (es un `splice` o dejar el array vacío).
- **Filtrar el historial** por patente o por fecha.
- **Marcar los "No" con un tilde rojo gigante** en vez de solo la palabra, para que se
  vea de reojo en el auto.
- **Poner un botón de volver arriba** cuando hay historial largo.
- **Exportar a PDF** en vez de CSV, así el chofer se lleva el papel impreso.
- **Sacar el admin a una contraseña con hash** y sumarle un límite de intentos.

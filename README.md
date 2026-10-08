# Control de Flotas — Checklist Diario

Desarrollamos este sistema para digitalizar y simplificar el control diario de los vehículos de los repartidores. La idea es que los choferes puedan hacer la inspección preventiva antes de salir a la calle desde el celular, y los supervisores tengan todo el historial.

---

## Qué resuelve

- **Inspección rápida:** Formulario sencillo para que el repartidor revise luces, frenos, neumáticos, fluidos y estado general del vehículo en pocos minutos.
- **Detección temprana de fallas:** Evita que los vehículos salgan a la calle con problemas mecánicos o de seguridad.
- **Seguimiento para supervisores:** Panel directo para auditar el estado de la flota, ver quién completó la planilla y gestionar mantenimientos.

---

## Estructura del proyecto

```text
├── src/
│   ├── components/       # Formularios de checklist, tarjetas de vehículos y alertas
│   ├── pages/            # Vistas para el chofer (Checklist) y el supervisor (Panel)
│   ├── hooks/            # Manejo del estado del vehículo y registros de inspección
│   └── data/             # Configuración de preguntas, lista de móviles y roles
├── package.json
└── README.md

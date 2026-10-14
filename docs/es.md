# Anker SOLIX

Siga en Gladys sus baterías solares **Anker SOLIX Solarbank** (E1600,
Solarbank 2, Solarbank 3), el **Smart Meter** y los **Smart Plug** de Anker, y
los microinversores **MI80** vinculados a un sistema: nivel de batería, carga
y descarga, producción solar, potencia enviada a la casa, importación y
exportación de la red. Con la opción «Permitir los ajustes», Gladys también
puede cambiar el **modo de uso** y la **potencia de salida** de una
Solarbank 2 o 3.

La integración pasa por la nube de Anker, como la aplicación Anker: no se
comunica directamente con los dispositivos.

> **Desarrollada sin el hardware**: se basa en respuestas reales de la nube
> publicadas por la biblioteca
> [anker-solix-api](https://github.com/thomluther/anker-solix-api). Sus
> comentarios son bienvenidos. Integración independiente, sin relación con
> Anker Innovations.

## Presentación

- Un dispositivo de Gladys por **Solarbank**, **microinversor**, **medidor** y
  **enchufe** de cada sistema Anker, más un dispositivo **«Anker SOLIX
  <sistema>»** para lo que concierne a todo el sistema (modo de uso, consumo
  de la casa, producción solar).
- Los valores se vuelven a leer cada minuto (ajustable) y solo se envían a
  Gladys los valores que cambian.
- La producción solar total es un **índice** (kWh): el seguimiento de energía
  de Gladys 5.2 calcula a partir de él la producción por media hora.
- Un widget del panel muestra el flujo de energía: sol → batería → casa /
  red, y el nivel de batería.

## Requisitos

- Gladys **5.2.0** o posterior.
- Un sistema configurado en la **aplicación Anker** («Power System»): la nube
  no publica ningún valor de un dispositivo que no pertenece a ningún sistema.
- La cuenta Anker (correo electrónico, contraseña, país elegido al crear la
  cuenta).

**Cuenta recomendada: una segunda cuenta.** Durante mucho tiempo, la nube de
Anker solo aceptaba una sesión por cuenta: la conexión de Gladys
desconectaba la aplicación del teléfono. Desde la aplicación 3.10 (julio de 2025) una cuenta puede usarse en paralelo, pero lo más seguro sigue siendo
crear una segunda cuenta Anker (otra dirección de correo) y **compartir su
sistema** con ella desde la aplicación (compartir el sistema con miembros de
la familia). Una cuenta compartida («miembro») ve todos los valores pero **no
puede cambiar los ajustes**: para controlar el modo y la potencia desde
Gladys, use la cuenta propietaria.

## Configuración

1. Instale la integración desde **Integraciones → Instalar desde GitHub** (o
   desde la tienda una vez publicada).
2. En la pestaña **Configuración**, introduzca:
   - el **Correo electrónico** y la **Contraseña** de la cuenta Anker;
   - el **País de la cuenta**: el código de dos letras elegido al crear la
     cuenta (`ES`, `FR`, `DE`, `BE`, `CH`, `US`…). Elige el servidor de Anker
     (Europa o resto del mundo); un país incorrecto da una conexión correcta
     pero ningún sistema;
   - el **Idioma de los nombres**: idioma de los nombres de las funciones y
     de los mensajes (francés por defecto);
   - el **Intervalo de actualización**: 1, 2 o 5 minutos. La nube de Anker no
     actualiza más rápido (cada 5 minutos en muchas Solarbank 2);
   - **Permitir los ajustes**: desactivado por defecto, Gladys entonces solo
     lee.
3. Guarde y luego **Probar la conexión**: el mensaje indica el número de
   sistemas y de dispositivos encontrados.
4. Añada los dispositivos desde la pestaña **Descubrimiento**.

El token de sesión se guarda en `/data` (nunca la contraseña) para no volver
a iniciar sesión en cada reinicio.

## Dispositivos

**Anker SOLIX <sistema>** (uno por sistema Anker):

| Función                 | Detalle                                                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modo de uso             | Solarbank 2 y 3: medidor inteligente, enchufes inteligentes, plan manual, modo IA (Solarbank 3), y en solo lectura carga de emergencia, franjas horarias, tarifa dinámica |
| Consumo de la casa      | W, con un medidor en el sistema                                                                                                                                           |
| Producción solar total  | kWh, índice desde la puesta en servicio                                                                                                                                   |
| Producción solar de hoy | kWh, leída cada 5 minutos                                                                                                                                                 |

**Solarbank** (E1600, Solarbank 2 Pro / Plus / AC, Solarbank 3):

| Función                         | Detalle                                                           |
| ------------------------------- | ----------------------------------------------------------------- |
| Nivel de batería                | %                                                                 |
| Energía almacenada              | kWh, según la capacidad del modelo y de las baterías de expansión |
| Potencia de carga / de descarga | W, siempre positivas                                              |
| Potencia solar                  | W, todas las entradas                                             |
| Entrada solar 1 a 4             | W, por entrada cuando la nube la da (Solarbank 2 y 3)             |
| Potencia hacia la casa          | W, salida de la Solarbank                                         |

**Microinversor** (MI80 en un sistema): potencia solar (W).

**Medidor** (Anker Smart Meter, Shelly 3EM / Pro 3EM): importación de la red
y exportación a la red (W).

**Enchufe** (Anker Smart Plug): consumo eléctrico (W).

El **modo de uso** aparece como botones en el panel. Una pulsación solo actúa
si «Permitir los ajustes» está activado (si no, Gladys explica por qué y
vuelve a mostrar el modo real).

## Widget

El widget **Anker SOLIX** (ajuste: el sistema, opcional) muestra:

- el **nivel de batería** en un indicador;
- **Solar**, **Carga / Descarga**, **Hacia la casa** e **Importación /
  Exportación** (con un medidor): el flujo de energía se lee de izquierda a
  derecha;
- el modo de uso, la consigna de salida, la energía almacenada, la producción
  del día y los dispositivos sin conexión;
- con «Permitir los ajustes» y la cuenta propietaria, dos botones que abren
  un formulario: **Potencia** (plan manual) y **Modo**.

## Disparadores y acciones de escena

Disparadores:

- **Modo de uso cambiado**: el modo cambió fuera de Gladys (aplicación Anker,
  carga de emergencia, modo IA). Filtros: sistema, nuevo modo. Variables:
  nuevo modo (clave y etiqueta), modo anterior. Un cambio hecho por Gladys no
  lo dispara.
- **Dispositivo sin conexión o de vuelta**: una Solarbank, un medidor o un
  enchufe dejó de informar a la nube de Anker (dos lecturas seguidas), o
  vuelve a hacerlo. Filtros: dispositivo, estado. Variables: nombre, estado.

«Batería llena» y «batería por debajo de un umbral» no son disparadores de la
integración: el disparador de Gladys **«Cambio de estado del dispositivo»** sobre el
**Nivel de batería**, con «Ejecutar solo cuando se supere el umbral», ya lo hace.

Acciones («Permitir los ajustes» activado, cuenta propietaria, Solarbank 2
o 3):

- **Ajustar la potencia de salida**: cambia la potencia de la franja actual
  del plan manual (redondeada al paso de 10 W, limitada por el sistema).
  Salida: potencia aplicada. El modo debe ser «Plan manual».
- **Cambiar el modo de uso**: medidor inteligente, enchufes inteligentes,
  plan manual o modo IA. Salida: modo aplicado.

Nunca se escribe nada más (ni firmware, ni reserva de batería, ni límites).

## Ejemplos de escenas

- **Poner la lavadora con el excedente**: disparador «Cambio de estado
  del dispositivo» sobre _Exportación a la red_ por encima de 500 W durante 10
  minutos → encender el enchufe de la lavadora.
- **Batería llena**: disparador «Cambio de estado del dispositivo» sobre _Nivel de
  batería_ ≥ 100, solo al superar el umbral → notificación «Batería llena,
  aproveche el sol».
- **Noche**: a las 18 h → acción «Ajustar la potencia de salida» a 300 W; a
  las 23 h → 100 W (plan manual).
- **Alerta**: «Dispositivo sin conexión o de vuelta», estado _sin conexión_ →
  notificación con `{{triggerEvent.data.device_name}}`.

## Solución de problemas

- **«La nube de Anker rechazó el correo electrónico o la contraseña»**:
  compruébelos en la aplicación Anker. Gladys no vuelve a intentarlo hasta
  que se guarde de nuevo la configuración, para que la cuenta no se bloquee.
- **Se pide un código de verificación**: inicie sesión una vez en la cuenta
  en la aplicación Anker y luego guarde la configuración.
- **Conectado, pero ningún sistema**: país de la cuenta incorrecto, o sistema
  no compartido con esta cuenta.
- **Los valores no cambian**: la nube a veces actualiza una Solarbank 2 solo
  cada 5 minutos; compruebe que la aplicación Anker muestra valores
  recientes.
- **Ajuste rechazado**: «Permitir los ajustes» desactivado, cuenta miembro,
  Solarbank 1, o un modo distinto de «Plan manual» para la potencia.
- Registros detallados: variable `LOG_LEVEL=debug` del contenedor. Los
  registros nunca contienen el correo, la contraseña ni el token.

## Limitaciones

- **Desarrollada sin el hardware**: probada con respuestas reales de la nube
  publicadas por anker-solix-api, no en una instalación. Comentarios
  bienvenidos.
- Solo nube: sin Internet, o si Anker cambia su API, no hay más valores. Los
  valores llevan de 1 a 5 minutos de retraso.
- Cuotas: una lectura por sistema y por intervalo, la producción del día cada
  5 minutos, como mucho una solicitud cada 0,5 s; la nube limita cada punto
  de acceso a unas diez solicitudes por minuto.
- Ajustes solo para Solarbank 2 y 3 (modo, potencia de la franja actual); la
  Solarbank 1 es de solo lectura.
- Estaciones portátiles (Solix C/F), Power Panel y X1: la nube no da sus
  valores por esta API (pasan por MQTT), no son compatibles. Solarbank 4 y
  Solarbank Max: se leen si la nube las incluye en el sistema, sin ajustes ni
  pruebas.
- Los enchufes se leen, no se controlan.

/*
 * presets.js — mitgelieferte Beispielprojekte.
 * "Simons Zimmer" ist der Raum, aus dem dieses Werkzeug entstanden ist:
 * 372 × 380 cm mit abgeschrägter Südwestecke, fünf durchgerechnete Varianten.
 */

const SCHRAEGSCHRANK = { typeId: 'wandschrank', cx: 106.8, cy: 332.7, a: 49.7 };

export const SIMONS_ZIMMER = {
  id: 'preset_zimmer',
  name: 'Simons Zimmer · 14,7 m²',
  room: {
    wall: 37,
    points: [[0, 0], [372, 0], [372, 380], [322, 380], [322, 440], [123, 440], [123, 392], [51, 307], [0, 307]],
    features: [
      { id: 'f_fenster', kind: 'window', label: 'Fenster', x: 127, y: 0, a: 0, w: 117 },
      { id: 'f_heizung', kind: 'radiator', label: 'Heizkörper', x: 141, y: 0, a: 0, w: 90, h: 20 },
      { id: 'f_tuer', kind: 'door', label: 'Tür', x: 128, y: 440, a: 0, w: 95, hinge: 'end', swing: 1 }
    ]
  },
  catalog: [
    { id: 'bett', label: 'Bett', w: 145, h: 205, fill: '#3F5C8C', back: true },
    { id: 'schreibtisch', label: 'Schreibtisch', w: 120, h: 80, fill: '#26766A', back: false },
    { id: 'sofa', label: 'Sofa', w: 180, h: 85, fill: '#8A5340', back: true },
    { id: 'wandschrank', label: 'Wandschrank', w: 120, h: 52, fill: '#67702F', back: true },
    { id: 'sessel', label: 'Lehnensessel', w: 80, h: 80, fill: '#98682C', back: true },
    { id: 'kommode', label: 'Kommode', w: 42, h: 38, fill: '#6A5686', back: true }
  ],
  layouts: [
    {
      id: 'l_jetzt', name: 'Jetzt', sub: 'aktuelles Layout',
      notes: [
        { t: 'Aus dem Screenshot nachgebaut, auf etwa ±5 cm genau — schieb die Möbel gerade, wenn etwas falsch abgelesen ist.' },
        { t: 'Der Schrank in der Schräge ist der stärkste Zug im Raum: die Ecke wäre sonst tote Fläche, und dafür wird eine ganze Wand frei.' },
        { t: 'Bett und Sofa stehen an gegenüberliegenden Wänden, dazwischen bleiben rund 140 cm — komfortabel.' },
        { t: 'Der Schreibtisch steht neben dem Fenster statt davor: Licht kommt von links, der Blick geht in die Ecke.', caution: true }
      ],
      items: [
        { typeId: 'bett', cx: 72.5, cy: 102.5, a: 0 },
        { typeId: 'schreibtisch', cx: 312, cy: 40, a: 0 },
        { typeId: 'sofa', cx: 329.5, cy: 250, a: 90 },
        { typeId: 'sessel', cx: 281, cy: 396, a: 0 },
        SCHRAEGSCHRANK,
        { typeId: 'kommode', cx: 351, cy: 360, a: 0 }
      ]
    },
    {
      id: 'l_idee', name: 'Idee', sub: 'Sofa links, Bett frei',
      notes: [
        { t: 'Sofa an der linken Wand, Sessel schräg dazu, Kommode als Beistelltisch — die geselligste Anordnung.' },
        { t: 'Das Bett steht frei mit rund 20 cm Luft zur rechten Wand. Das kostet Fläche, lohnt sich nur, wenn man von beiden Seiten ran will.' },
        { t: 'Das Fußende ist 15 cm nach oben gerückt: ab etwa 95 cm vor der Türangel schlägt die Tür sonst gegen die Bettecke.', caution: true },
        { t: 'Der Sessel steht vor dem Heizkörper — als Leseplatz am Fenster schön, im Winter weniger.' }
      ],
      items: [
        { typeId: 'sofa', cx: 42.5, cy: 136, a: 90 },
        { typeId: 'sessel', cx: 150, cy: 72, a: -25 },
        { typeId: 'schreibtisch', cx: 289, cy: 42, a: 0 },
        { typeId: 'bett', cx: 279.5, cy: 243, a: 0 },
        { typeId: 'kommode', cx: 128, cy: 162, a: 0 },
        SCHRAEGSCHRANK
      ]
    },
    {
      id: 'l_zonen', name: 'Zonen', sub: 'Schlafen rechts, Wohnen links',
      notes: [
        { t: 'Bett längs an der rechten Wand, Kopfende zur Fensterwand — von links auf 142 cm Breite frei zugänglich.' },
        { t: 'Wandschrank und Sofa bilden die linke Wand als durchgehende Wohnzeile (120 + 180 cm auf 307 cm Wand).' },
        { t: 'Schreibtisch vorm Fenster: Licht von vorn, Sessel in der freien Südostecke.' },
        { t: 'Der Schreibtisch steht vor dem Heizkörper — im Winter Wärmestau.', caution: true }
      ],
      items: [
        { typeId: 'bett', cx: 299.5, cy: 102.5, a: 0 },
        { typeId: 'wandschrank', cx: 26, cy: 60, a: 90 },
        { typeId: 'sofa', cx: 42.5, cy: 216, a: 90 },
        { typeId: 'schreibtisch', cx: 167, cy: 62, a: 0 },
        { typeId: 'sessel', cx: 290, cy: 336, a: 0 },
        { typeId: 'kommode', cx: 351, cy: 226, a: 0 }
      ]
    },
    {
      id: 'l_spiegel', name: 'Gespiegelt', sub: 'Bett links, Wohnwand rechts',
      notes: [
        { t: 'Bett an der linken Wand — man steigt zur Zimmermitte hin aus, die Tür liegt diagonal gegenüber.' },
        { t: 'Die rechte Wand trägt Schrank und Sofa am Stück: 380 cm, die längste ungestörte Wand im Raum.' },
        { t: 'Schreibtisch mittig vorm Fenster, Kommode als Nachttisch am Fußende.' },
        { t: 'Das Sofa schaut auf die linke Wand, wo schon das Bett steht — für einen Fernseher bleibt dort wenig Platz.', caution: true }
      ],
      items: [
        { typeId: 'bett', cx: 72.5, cy: 102.5, a: 0 },
        { typeId: 'wandschrank', cx: 346, cy: 60, a: 90 },
        { typeId: 'sofa', cx: 329.5, cy: 218, a: 90 },
        { typeId: 'schreibtisch', cx: 205, cy: 62, a: 0 },
        { typeId: 'sessel', cx: 278, cy: 370, a: 0 },
        { typeId: 'kommode', cx: 19, cy: 233, a: 90 }
      ]
    },
    {
      id: 'l_schraege', name: 'Schräge', sub: 'Schrank in die Ecke, Heizung frei',
      notes: [
        { t: 'Übernimmt den Schrank-in-der-Schräge-Trick und macht damit die ganze linke Wand für das Sofa frei.' },
        { t: 'Schreibtisch an der rechten Wand unterhalb des Bettes — Fensterbank und Heizkörper bleiben komplett frei.' },
        { t: 'Sofa in der Nordwestecke mit Blick quer durch den Raum, Sessel in der Südostecke als Gegenstück.' },
        { t: 'Der Schrank ragt an beiden Enden etwas über die 111 cm lange Schräge hinaus — prüfen, ob die Türen dort aufgehen.', caution: true }
      ],
      items: [
        { typeId: 'bett', cx: 299.5, cy: 102.5, a: 0 },
        { typeId: 'sofa', cx: 42.5, cy: 90, a: 90 },
        SCHRAEGSCHRANK,
        { typeId: 'schreibtisch', cx: 332, cy: 270, a: 90 },
        { typeId: 'sessel', cx: 280, cy: 392, a: 0 },
        { typeId: 'kommode', cx: 19, cy: 211, a: 90 }
      ]
    }
  ],
  activeLayoutId: 'l_jetzt'
};

export const PRESETS = [SIMONS_ZIMMER];

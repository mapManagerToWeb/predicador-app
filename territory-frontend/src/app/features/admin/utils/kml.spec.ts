import type { ManzanasCollection } from '../admin.models';
import { aKml, deKml } from './kml';

const COLECCION: ManzanasCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 7,
      properties: { id: 7, territorio: 12, nombre: '12 C & "esquina"', areaM2: 900, valida: true },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-73.3123456, -37.6123456],
            [-73.3, -37.6],
            [-73.29, -37.61],
            [-73.3123456, -37.6123456],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 8,
      properties: { id: 8, territorio: 12, nombre: '12 D', areaM2: 400, valida: true },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [-73.28, -37.6],
              [-73.27, -37.6],
              [-73.27, -37.59],
              [-73.28, -37.6],
            ],
          ],
          [
            [
              [-73.26, -37.6],
              [-73.25, -37.6],
              [-73.25, -37.59],
              [-73.26, -37.6],
            ],
            [
              [-73.258, -37.597],
              [-73.257, -37.597],
              [-73.257, -37.596],
              [-73.258, -37.597],
            ],
          ],
        ],
      },
    },
  ],
};

describe('KML de manzanas', () => {
  it('exporta cada manzana como Placemark con sus propiedades y coordenadas longitud,latitud', () => {
    const kml = aKml(COLECCION);

    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml.match(/<Placemark>/g)).toHaveLength(2);
    expect(kml).toContain('<Data name="territorio"><value>12</value></Data>');
    expect(kml).toContain('<Data name="nombre"><value>12 C &amp; &quot;esquina&quot;</value></Data>');
    expect(kml).toContain('<coordinates>-73.3123456,-37.6123456 -73.3,-37.6 -73.29,-37.61 -73.3123456,-37.6123456</coordinates>');
    expect(kml).toContain('<outerBoundaryIs>');
  });

  it('exporta un MultiPolygon como MultiGeometry con un Polygon por parte', () => {
    const kml = aKml(COLECCION);
    const multi = kml.slice(kml.lastIndexOf('<MultiGeometry>'));

    expect(multi).toContain('<MultiGeometry>');
    expect(multi.match(/<Polygon>/g)).toHaveLength(2);
    expect(multi).toContain('<innerBoundaryIs>');
  });

  it('vuelve a leer lo que exportó sin perder territorio, nombre ni forma', () => {
    const vuelta = deKml(aKml(COLECCION));

    expect(vuelta.features).toHaveLength(2);
    expect(vuelta.features[0].properties).toEqual({ territorio: 12, nombre: '12 C & "esquina"' });
    expect(vuelta.features[0].geometry).toEqual(COLECCION.features[0].geometry);
    expect(vuelta.features[1].geometry).toEqual(COLECCION.features[1].geometry);
  });

  it('lee Data, SimpleData, el nombre del Placemark y coordenadas con altura', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2" xmlns:kml="http://www.opengis.net/kml/2.2">
        <Document>
          <Placemark>
            <name>85 C</name>
            <ExtendedData>
              <SchemaData schemaUrl="#manzanas">
                <SimpleData name="territorio">85</SimpleData>
              </SchemaData>
            </ExtendedData>
            <Polygon>
              <outerBoundaryIs>
                <LinearRing>
                  <coordinates>
                    -73.1,-37.1,10  -73.0,-37.1,10  -73.0,-37.0,10
                  </coordinates>
                </LinearRing>
              </outerBoundaryIs>
            </Polygon>
          </Placemark>
        </Document>
      </kml>`;

    const vuelta = deKml(kml);

    expect(vuelta.features).toHaveLength(1);
    expect(vuelta.features[0].properties).toEqual({ territorio: 85, nombre: '85 C' });
    expect(vuelta.features[0].geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [-73.1, -37.1],
          [-73, -37.1],
          [-73, -37],
          [-73.1, -37.1],
        ],
      ],
    });
  });

  it('acepta el prefijo kml: de Google Earth', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
      <kml:kml xmlns:kml="http://www.opengis.net/kml/2.2">
        <kml:Document>
          <kml:Placemark>
            <kml:name>9 A</kml:name>
            <kml:ExtendedData>
              <kml:Data name="territorio"><kml:value>9</kml:value></kml:Data>
            </kml:ExtendedData>
            <kml:Polygon>
              <kml:outerBoundaryIs>
                <kml:LinearRing>
                  <kml:coordinates>-73,-37 -72.9,-37 -72.9,-36.9 -73,-37</kml:coordinates>
                </kml:LinearRing>
              </kml:outerBoundaryIs>
            </kml:Polygon>
          </kml:Placemark>
        </kml:Document>
      </kml:kml>`;

    expect(deKml(kml).features[0].properties).toEqual({ territorio: 9, nombre: '9 A' });
  });

  it('rechaza archivos que no son KML, sin manzanas o con manzanas incompletas', () => {
    expect(() => deKml('no es xml')).toThrow(/no es un KML válido/);
    expect(() => deKml('<gpx><wpt/></gpx>')).toThrow(/no es un KML válido/);
    expect(() => deKml('PK\u0003\u0004kmz')).toThrow(/KMZ comprimido/);
    expect(() => deKml('<kml><Document></Document></kml>')).toThrow(/no tiene manzanas/);

    const sinTerritorio = `<kml><Document><Placemark><name>1 A</name>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>-73,-37 -72.9,-37 -72.9,-36.9 -73,-37</coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark></Document></kml>`;
    expect(() => deKml(sinTerritorio)).toThrow(/falta la propiedad "territorio"/);

    const punto = `<kml><Document><Placemark><name>1 A</name>
      <ExtendedData><Data name="territorio"><value>1</value></Data></ExtendedData>
      <Point><coordinates>-73,-37</coordinates></Point>
      </Placemark></Document></kml>`;
    expect(() => deKml(punto)).toThrow(/no es un polígono/);

    const dosPuntos = `<kml><Document><Placemark><name>1 A</name>
      <ExtendedData><Data name="territorio"><value>1</value></Data></ExtendedData>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>-73,-37 -72.9,-37</coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark></Document></kml>`;
    expect(() => deKml(dosPuntos)).toThrow(/menos de 3 puntos/);
  });

  it('no importa nada si una manzana viene mala, igual que el GeoJSON', () => {
    const kml = `<kml><Document>
      <Placemark><name>1 A</name>
        <ExtendedData><Data name="territorio"><value>1</value></Data></ExtendedData>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>-73,-37 -72.9,-37 -72.9,-36.9 -73,-37</coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
      <Placemark><name>1 B</name>
        <Polygon><outerBoundaryIs><LinearRing><coordinates>-72,-37 -71.9,-37 -71.9,-36.9 -72,-37</coordinates></LinearRing></outerBoundaryIs></Polygon>
      </Placemark>
    </Document></kml>`;

    expect(() => deKml(kml)).toThrow(/No se importó nada\. 1 error/);
  });
});

import {FarosClient, Location} from 'faros-js-client';

import {DestinationRecord} from '../converter';

export class LocationCollector {
  private readonly farosClient?: FarosClient;
  private readonly locationsCache = new Map<string, Location>();

  constructor(resolveLocation: boolean, farosClient?: FarosClient) {
    if (resolveLocation && farosClient) {
      this.farosClient = farosClient;
    }
  }

  async collect(location?: string): Promise<{uid: string} | null> {
    if (!location) {
      return null;
    }

    if (this.locationsCache.has(location)) {
      return {uid: this.locationsCache.get(location).uid};
    }

    if (!this.farosClient) {
      // When we don't resolve locations, use the raw location string as the address
      const address = {uid: location, fullAddress: location};
      this.locationsCache.set(location, {
        uid: location,
        raw: location,
        address,
      });
      return {uid: location};
    }

    const data = await this.farosClient.geocode(location);
    const resolvedLocation = data[0]; // Resolving one location at a time
    const uid = resolvedLocation.uid;
    this.locationsCache.set(location, resolvedLocation);
    return {uid};
  }

  convertLocations(): DestinationRecord[] {
    const seenAddresses = new Set<string>();
    const seenCoordinates = new Set<string>();
    const records: DestinationRecord[] = [];
    Array.from(this.locationsCache.values()).forEach((location) => {
      const address = location.address;
      if (!seenAddresses.has(address.uid)) {
        records.push({
          model: 'geo_Address',
          record: address,
        });
        seenAddresses.add(address.uid);
      }
      if (location.coordinates) {
        const coordinates = location.coordinates;
        const coordinatesKey = `${coordinates.lat}-${coordinates.lon}`;
        if (!seenCoordinates.has(coordinatesKey)) {
          records.push({
            model: 'geo_Coordinates',
            record: location.coordinates,
          });
          seenCoordinates.add(coordinatesKey);
        }
      }
      records.push({
        model: 'geo_Location',
        record: {
          uid: location.uid,
          raw: location.raw,
          address: {uid: address.uid},
          coordinates: location.coordinates,
        },
      });
    });
    return records;
  }
}

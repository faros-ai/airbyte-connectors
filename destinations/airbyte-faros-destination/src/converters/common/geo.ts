import {AirbyteLogger} from 'faros-airbyte-cdk';
import {FarosClient, Location} from 'faros-js-client';
import {isFinite, toNumber} from 'lodash';

import {DestinationRecord} from '../converter';

export class LocationCollector {
  private readonly farosClient?: FarosClient;
  private readonly locationsCache = new Map<string, Location>();

  constructor(
    resolveLocation: boolean,
    farosClient?: FarosClient,
    private readonly logger?: AirbyteLogger
  ) {
    if (resolveLocation && farosClient) {
      this.farosClient = farosClient;
    }
  }

  async collect(location?: string): Promise<{uid: string} | null> {
    const normalizedLocation = location?.trim();
    if (!normalizedLocation) {
      return null;
    }

    if (this.locationsCache.has(normalizedLocation)) {
      const cached = this.locationsCache.get(normalizedLocation);
      return {uid: cached.uid};
    }

    if (!this.farosClient) {
      return this.handleUncodedLocation(normalizedLocation);
    }

    const data = await this.farosClient.geocode(normalizedLocation);
    if (!data?.[0]?.uid) {
      this.logger?.warn(
        `Invalid geocoding response for location '${normalizedLocation}'. ` +
          'Will use non-geocoded location.'
      );
      return this.handleUncodedLocation(normalizedLocation);
    }
    const resolvedLocation = data[0];
    this.locationsCache.set(normalizedLocation, resolvedLocation);
    return {uid: resolvedLocation.uid};
  }

  convertLocations(): DestinationRecord[] {
    const seenAddresses = new Set<string>();
    const seenCoordinates = new Set<string>();
    const records: DestinationRecord[] = [];

    Array.from(this.locationsCache.values()).forEach((location) => {
      const address = location.address;
      const isValidAddress = address?.uid;
      if (isValidAddress) {
        if (!seenAddresses.has(address.uid)) {
          records.push({
            model: 'geo_Address',
            record: address,
          });
          seenAddresses.add(address.uid);
        }
      }

      const rawCoordinates = location.coordinates;
      const lat = rawCoordinates?.lat ? toNumber(rawCoordinates.lat) : null;
      const lon = rawCoordinates?.lon ? toNumber(rawCoordinates.lon) : null;
      const coordinates = isFinite(lat) && isFinite(lon) ? {lat, lon} : null;
      if (coordinates) {
        const coordinatesKey = `${rawCoordinates.lat}:${rawCoordinates.lon}`;
        if (!seenCoordinates.has(coordinatesKey)) {
          records.push({
            model: 'geo_Coordinates',
            record: coordinates,
          });
          seenCoordinates.add(coordinatesKey);
        }
      } else {
        this.logger?.warn(
          `Invalid coordinates lat: ${rawCoordinates.lat} and lon: ` +
            `${rawCoordinates.lon} for location '${location.raw}'.`
        );
      }

      // Create location record with optional address and coordinates
      records.push({
        model: 'geo_Location',
        record: {
          uid: location.uid,
          raw: location.raw,
          address: isValidAddress ? {uid: address.uid} : null,
          coordinates: coordinates ? {lat, lon} : null,
        },
      });
    });
    return records;
  }

  private handleUncodedLocation(normalizedLocation: string): {uid: string} {
    const address = {
      uid: normalizedLocation,
      fullAddress: normalizedLocation,
    };
    this.locationsCache.set(normalizedLocation, {
      uid: normalizedLocation,
      raw: normalizedLocation,
      address,
    });
    return {uid: normalizedLocation};
  }
}

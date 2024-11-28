import {CategoryDetail} from './common';

export interface VulnerabilityIdentifier {
  uid: string;
  type: CategoryDetail;
}

export class Vulnerability {
  // Mapping Qualitative Severity Ratings to CVSS v4.0 Severity Scores
  // using the upper bound of each rating
  // https://nvd.nist.gov/vuln-metrics/cvss
  static ratingToScore(rating: string): number {
    switch (rating?.toLowerCase()) {
      case 'none':
        return 0;
      case 'low':
        return 3.9;
      case 'medium':
        return 6.9;
      case 'high':
        return 8.9;
      case 'critical':
        return 10.0;
    }
  }

  static identifierType(type: string): CategoryDetail {
    switch (type?.toLowerCase()) {
      case 'cve':
        return {category: 'CVE', detail: 'CVE'};
      case 'ghsa':
        return {category: 'GHSA', detail: 'GHSA'};
      default:
        return {category: 'Custom', detail: type};
    }
  }
}

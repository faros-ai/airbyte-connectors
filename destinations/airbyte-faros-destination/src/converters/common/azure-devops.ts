// TODO: Make it return OrgKey
export function getOrganizationFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');

    if (parts.length < 2 || parts[1] === '') {
      return undefined;
    }

    return parts[1];
  } catch (error) {
    return undefined;
  }
}

export function getProjectFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');

    if (parts.length < 3 || parts[2] === '') {
      return undefined;
    }

    return parts[2];
  } catch (error) {
    return undefined;
  }
}

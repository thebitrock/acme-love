import { select, input } from '@inquirer/prompts';
import { provider } from '../../index.js';
import type { AcmeProvider, AcmeDirectoryEntry } from '../../index.js';

/** Build interactive choices for all bundled ACME directory endpoints. */
export function buildDirectoryChoices() {
  const choices: { name: string; value: string }[] = [];
  for (const [providerKey, providerData] of Object.entries(provider)) {
    for (const [envKey, envData] of Object.entries(
      providerData as Record<string, { name: string; directoryUrl: string }>,
    )) {
      choices.push({
        name: `${envData.name} (${providerKey}/${envKey})`,
        value: envData.directoryUrl,
      });
    }
  }
  choices.sort((a, b) => a.name.localeCompare(b.name));
  return choices;
}

/**
 * Resolve an ACME directory URL using flags or interactive selection.
 * @returns The chosen directory URL.
 */
export async function resolveDirectoryUrl(opts: {
  staging?: boolean;
  production?: boolean;
  directory?: string;
}): Promise<string> {
  if (opts.staging) return provider.letsencrypt.staging.directoryUrl;
  if (opts.production) return provider.letsencrypt.production.directoryUrl;
  if (opts.directory) return opts.directory;
  const directoryChoices = buildDirectoryChoices();
  const envChoice = await select({
    message: 'Select ACME directory:',
    choices: [...directoryChoices, { name: 'Custom ACME Directory URL', value: 'custom' }],
  });
  if (envChoice === 'custom') {
    return input({ message: 'Enter custom ACME directory URL:' });
  }
  return envChoice;
}

/** Return a human-friendly provider/environment name for a given directory URL. */
export function friendlyDirectoryName(url: string): string | undefined {
  for (const [, providerData] of Object.entries(provider)) {
    for (const [, envData] of Object.entries(providerData as AcmeProvider)) {
      if ((envData as AcmeDirectoryEntry).directoryUrl === url)
        return (envData as AcmeDirectoryEntry).name;
    }
  }
  return undefined;
}

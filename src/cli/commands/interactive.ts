import { select, input } from '@inquirer/prompts';
import { handleCertCommand, type CertCommandOptions } from './cert.js';
import { handleCreateAccountKey } from './create-account-key.js';
import { buildDirectoryChoices, friendlyDirectoryName } from '../utils/directories.js';

/** Options controlling preselected environment for interactive mode. */
export interface InteractiveOptions {
  staging?: boolean;
  production?: boolean;
  directory?: string;
}

/** Launch interactive multi-action session. */
export async function handleInteractiveMode(options: InteractiveOptions = {}) {
  console.log('Interactive Mode');
  if (!options.staging && !options.production && !options.directory) {
    const directoryChoices = buildDirectoryChoices();
    const envChoice = await select({
      message: 'Select ACME directory:',
      choices: [...directoryChoices, { name: 'Custom ACME Directory URL', value: 'custom' }],
    });
    if (envChoice === 'custom')
      options.directory = await input({ message: 'Enter custom ACME directory URL:' });
    else options.directory = envChoice;
  }
  if (options.staging) console.log("Using Let's Encrypt Staging");
  else if (options.production) console.log("Using Let's Encrypt Production");
  else if (options.directory) {
    const friendly = friendlyDirectoryName(options.directory) || 'Custom';
    console.log(`Directory: ${friendly}`);
  }
  const action = await select({
    message: 'Choose action:',
    choices: [
      { name: 'Obtain SSL Certificate', value: 'cert' },
      { name: 'Create Account Key', value: 'account-key' },
      { name: 'Exit', value: 'exit' },
    ],
  });
  switch (action) {
    case 'cert':
      await handleCertCommand(options as CertCommandOptions);
      break;
    case 'account-key':
      await handleCreateAccountKey({});
      break;
    case 'exit':
      console.log('Bye');
      break;
  }
}

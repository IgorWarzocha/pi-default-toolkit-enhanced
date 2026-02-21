/**
 * Mastery demonstration file
 * Shows single-file patch creation with proper context
 * 
 * Created via batch apply_patch
 */
console.log('Mastery demonstration: create, edit, delete in one operation');

interface DemoConfig {
  name: string;
  enabled: boolean;
  priority: number;
}

const config: DemoConfig = {
  name: 'mastery-demo',
  enabled: true,
  priority: 1
};

export { config, DemoConfig };

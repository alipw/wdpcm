import { readFileSync } from 'fs';

export interface ProcessEntry {
  alias: string;
  command: string;
}

export function parseProcessesFile(filePath: string): ProcessEntry[] {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() !== '');
  
  const processes: ProcessEntry[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') continue;
    
    const spaceIndex = trimmedLine.indexOf(' ');
    if (spaceIndex === -1) {
      processes.push({
        alias: trimmedLine,
        command: ''
      });
    } else {
      const alias = trimmedLine.substring(0, spaceIndex);
      const command = trimmedLine.substring(spaceIndex + 1);
      
      processes.push({
        alias,
        command
      });
    }
  }
  
  return processes;
}

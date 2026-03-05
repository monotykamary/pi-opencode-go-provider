#!/usr/bin/env node

/**
 * Script to update opencode-go models from models.dev API
 * Updates both index.ts and README.md
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = 'https://models.dev/api.json';
const PROVIDER_ID = 'opencode-go';

// Fetch JSON from URL
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// Format cost for display
function formatCost(cost) {
  if (cost === 0) return 'Free';
  return `$${cost.toFixed(2)}`;
}

// Format number with K/M suffix
function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K`;
  return num.toString();
}

// Get input types from modalities
function getInputTypes(modalities) {
  const types = modalities?.input || ['text'];
  const hasImage = types.includes('image');
  const hasText = types.includes('text');
  
  if (hasImage && hasText) return 'Text + Image';
  if (hasImage) return 'Image';
  return 'Text';
}

// Generate model entry for index.ts
function generateModelEntry(model) {
  const inputTypes = model.modalities?.input || ['text'];
  const cost = model.cost || {};
  const limit = model.limit || {};
  
  return `{
			id: "${model.id}",
			name: "${model.name}",
			reasoning: ${model.reasoning || false},
			input: ${JSON.stringify(inputTypes)},
			cost: {
				input: ${cost.input || 0},
				output: ${cost.output || 0},
				cacheRead: ${cost.cache_read || 0},
				cacheWrite: ${cost.cache_write || 0},
			},
			contextWindow: ${limit.context || 0},
			maxTokens: ${limit.output || 0},
		}`;
}

// Generate index.ts content
function generateIndexTS(models) {
  const modelEntries = models.map(m => '\t\t' + generateModelEntry(m)).join(',\n');
  
  return `/**
 * opencode-go Provider Extension
 *
 * Registers opencode-go as a custom provider using the openai-completions API.
 * Base URL: https://opencode.ai/zen/go/v1
 *
 * Usage:
 *   # Set your API key
 *   export OPENCODE_API_KEY=your-api-key
 *
 *   # Run pi with the extension
 *   pi -e /path/to/pi-opencode-go-provider
 *
 * Then use /model to select from available models
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerProvider("opencode-go", {
		baseUrl: "https://opencode.ai/zen/go/v1",
		apiKey: "OPENCODE_API_KEY",
		api: "openai-completions",

		models: [
${modelEntries}
		],
	});
}
`;
}

// Generate README model table row
function generateReadmeRow(model) {
  const cost = model.cost || {};
  const limit = model.limit || {};
  
  return `| ${model.name} | ${getInputTypes(model.modalities)} | ${formatNumber(limit.context || 0)} | ${formatNumber(limit.output || 0)} | ${formatCost(cost.input || 0)} | ${formatCost(cost.output || 0)} |`;
}

// Update README model table
function updateReadme(models) {
  const readmePath = path.join(process.cwd(), 'README.md');
  let readme = fs.readFileSync(readmePath, 'utf8');
  
  // Sort models by family and name
  const sortedModels = [...models].sort((a, b) => {
    const familyA = a.family || '';
    const familyB = b.family || '';
    if (familyA !== familyB) return familyA.localeCompare(familyB);
    return a.name.localeCompare(b.name);
  });
  
  // Generate table rows
  const tableRows = sortedModels.map(generateReadmeRow).join('\n');
  const newTable = `| Model | Type | Context | Max Tokens | Input Cost | Output Cost |
|-------|------|---------|------------|------------|-------------|
${tableRows}`;
  
  // Replace table in README
  const tableRegex = /\| Model \| Type \| Context \| Max Tokens \| Input Cost \| Output Cost \|[\s\S]*?(?=\n\*Costs are per million)/;
  readme = readme.replace(tableRegex, newTable);
  
  // Update model count in features
  readme = readme.replace(/\*\*\d+ Optimized AI Models\*\*/, `**${models.length} Optimized AI Models**`);
  
  fs.writeFileSync(readmePath, readme);
  console.log(`✓ Updated README.md with ${models.length} models`);
}

async function main() {
  console.log('Fetching models from API...');
  
  try {
    const data = await fetchJSON(API_URL);
    const provider = data[PROVIDER_ID];
    
    if (!provider) {
      throw new Error(`Provider "${PROVIDER_ID}" not found in API`);
    }
    
    if (!provider.models) {
      throw new Error(`No models found for provider "${PROVIDER_ID}"`);
    }
    
    // Convert models object to array and filter out deprecated
    const models = Object.values(provider.models).filter(m => m.status !== 'deprecated');
    
    console.log(`Found ${models.length} active models`);
    
    // Generate and write index.ts
    const indexContent = generateIndexTS(models);
    fs.writeFileSync(path.join(process.cwd(), 'index.ts'), indexContent);
    console.log('✓ Updated index.ts');
    
    // Update README
    updateReadme(models);
    
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

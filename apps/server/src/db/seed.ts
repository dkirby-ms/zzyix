import { randomUUID } from 'crypto'
import { getDatabaseBundle, closeDatabaseBundle } from './client.js'
import { activateCanonicalWorld, getCanonicalWorldStatus, provisionCanonicalWorld } from './repository.js'
import { users, canvases, tiles, participants } from './schema.js'
import { tileShapeValues, materialVariantValues } from './types.js'

// Demo data generation
const DEMO_CANVAS_ID = '00000000-0000-4000-8000-000000000001'
const DEMO_USER_CLIENT_ID = 'demo-client-001'
const DEMO_USER_NAME = 'Demo User'
const CANONICAL_OPERATOR_ID = 'db-seed'

const TILE_SHAPES = tileShapeValues
const DEMO_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1',
  '#FFA07A', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E2', '#F8B88B',
]
const DEMO_MATERIALS = materialVariantValues

const ensureCanonicalWorld = async (): Promise<void> => {
  let status = await getCanonicalWorldStatus()
  if (status.pointerStatus === 'missing') {
    console.log('[db:seed] Provisioning canonical world...')
    status = await provisionCanonicalWorld({
      action: 'provision',
      expectedGeneration: 0,
      patchRows: 32,
      patchColumns: 32,
      patchWidth: 31.2,
      patchHeight: 20.4,
      originX: 0,
      originY: 0,
      operatorId: CANONICAL_OPERATOR_ID,
      reason: 'provision canonical world during database seed',
    })
  }

  if (status.pointerStatus === 'inactive' && status.quilt) {
    console.log('[db:seed] Activating canonical world...')
    await activateCanonicalWorld({
      action: 'activate',
      quiltId: status.quilt.id,
      expectedGeneration: status.generation,
      operatorId: CANONICAL_OPERATOR_ID,
      reason: 'activate canonical world during database seed',
    })
  }
}

// Generate demo tiles for a grid pattern
const generateDemoTiles = (canvasId: string): Array<typeof tiles.$inferInsert> => {
  const demoTiles: Array<typeof tiles.$inferInsert> = []
  const tileSize = 2
  
  // Create a 5x5 grid of tiles
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const shapeIndex = (row + col) % TILE_SHAPES.length
      const colorIndex = (row * 5 + col) % DEMO_COLORS.length
      const materialIndex = (row + col) % DEMO_MATERIALS.length
      
      demoTiles.push({
        id: randomUUID() as any,
        canvasId,
        shape: TILE_SHAPES[shapeIndex],
        color: DEMO_COLORS[colorIndex],
        material: DEMO_MATERIALS[materialIndex],
        posX: col * tileSize - 5,
        posY: row * tileSize - 5,
        chunkX: Math.floor((col * tileSize - 5) / 16),
        chunkY: Math.floor((row * tileSize - 5) / 16),
        rotation: (Math.random() * Math.PI * 2),
        mirrored: Math.random() > 0.7,
        placedBy: DEMO_USER_CLIENT_ID,
        createdAt: new Date(),
      })
    }
  }
  
  return demoTiles
}

const run = async (): Promise<void> => {
  const { db } = getDatabaseBundle()
  
  console.log('[db:seed] Starting database seeding...')
  
  try {
    // Check if demo user already exists
    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.clientId, DEMO_USER_CLIENT_ID),
    })
    
    if (!existingUser) {
      console.log('[db:seed] Creating demo user...')
      await db.insert(users).values({
        id: randomUUID() as any,
        clientId: DEMO_USER_CLIENT_ID,
        displayName: DEMO_USER_NAME,
        createdAt: new Date(),
      })
    }
    
    // Check if demo canvas already exists
    const existingCanvas = await db.query.canvases.findFirst({
      where: (canvases, { eq }) => eq(canvases.id, DEMO_CANVAS_ID as any),
    })
    
    if (!existingCanvas) {
      console.log('[db:seed] Creating demo canvas...')
      await db.insert(canvases).values({
        id: DEMO_CANVAS_ID as any,
        version: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      
      console.log('[db:seed] Creating demo tiles...')
      const demoTiles = generateDemoTiles(DEMO_CANVAS_ID)
      await db.insert(tiles).values(demoTiles)
      
      console.log('[db:seed] Adding demo user as participant...')
      await db.insert(participants).values({
        canvasId: DEMO_CANVAS_ID as any,
        clientId: DEMO_USER_CLIENT_ID,
        joinedAt: new Date(),
      })
    } else {
      console.log('[db:seed] Demo canvas already exists, skipping seeding')
    }

    await ensureCanonicalWorld()
    
    console.log('[db:seed] Database seeding completed successfully')
  } catch (error) {
    console.error('[db:seed] Seeding failed:', error)
    throw error
  }
}

run()
  .catch((error) => {
    console.error('[db:seed] Fatal error:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await closeDatabaseBundle()
  })

import { NextRequest, NextResponse } from 'next/server';
import { runScenario } from '@/engine/scenario';
import { ScenarioParams } from '@/engine/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const params: ScenarioParams = body;

    const result = runScenario(params);

    // Serialize: BigInt not JSON-serializable, convert pool snapshots
    const serialized = {
      ...result,
      pools: {
        ...result.pools,
        pt: result.pools.pt.map(s => ({ ...s, sqrtPriceX96: s.sqrtPriceX96.toString() })),
        rt: result.pools.rt.map(s => ({ ...s, sqrtPriceX96: s.sqrtPriceX96.toString() })),
      },
    };

    return NextResponse.json(serialized);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

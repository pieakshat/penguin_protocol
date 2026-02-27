'use server';

import { revalidatePath } from 'next/cache';

export async function buyTokens(formData: FormData) {
  const amount = formData.get('amount');
  
  // Logic to interface with your BondingCurve.sol would go here
  console.log("Server Action: Executing buy for", amount, "tokens");

  // This forces Next.js to refresh the data on the page without a full reload
  revalidatePath('/launch');
}
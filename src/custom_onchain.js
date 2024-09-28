import { PublicKey, TransactionInstruction } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(
	"HARBRqBp3GL6BzN5CoSFnKVQMpGah4mkBCDFLxigGARB"
);

export function arbgate(accounts) {
	const keys = [
		{ pubkey: accounts.signer, isSigner: false, isWritable: true },
		{ pubkey: accounts.toCheck, isSigner: false, isWritable: false }
	];
	const identifier = Buffer.from([230, 144, 187, 66, 156, 221, 77, 41]);
	const data = identifier;
	const ix = new TransactionInstruction({ keys, PROGRAM_ID, data });
	return ix;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { getSession } from "../../lib/auth";
import * as media from "../../lib/media";
import type { AssetKind } from "../../lib/media-contract";
import { MediaTransfer, type TransferSnapshot } from "../../lib/media-upload";

export function useIdentityGuard(viewerId: string) {
	const [active, setActive] = useState(true);
	const [error, setError] = useState("");
	const alive = useRef(true);
	const verify = useCallback(async () => {
		try {
			const result = await getSession();
			if (!result.ok) {
				if (alive.current) setError("unavailable");
				return false;
			}
			const same = result.value?.id === viewerId;
			if (alive.current) {
				setError("");
				if (!same) setActive(false);
			}
			return same;
		} catch {
			if (alive.current) setError("unavailable");
			return false;
		}
	}, [viewerId]);
	useEffect(() => {
		alive.current = true;
		const focus = () => {
			void verify();
		};
		window.addEventListener("focus", focus);
		return () => {
			alive.current = false;
			window.removeEventListener("focus", focus);
		};
	}, [verify]);
	return { active, verify, error };
}
export function useTransfer(file: File | null, kind: AssetKind) {
	const [snapshot, setSnapshot] = useState<TransferSnapshot>({
		phase: "idle",
		progress: 0,
	});
	const transfer = useRef<MediaTransfer | null>(null);
	useEffect(() => {
		let mounted = true;
		setSnapshot({ phase: "idle", progress: 0 });
		const next = file
			? new MediaTransfer(file, kind, media, (state) => {
					if (mounted) setSnapshot(state);
				})
			: null;
		transfer.current = next;
		return () => {
			mounted = false;
			next?.pause();
			transfer.current = null;
		};
	}, [file, kind]);
	return {
		snapshot,
		start: () => transfer.current?.start(),
		pause: () => transfer.current?.pause(),
		cancel: () => transfer.current?.cancel(),
	};
}
export function useObjectUrl(file: File | null) {
	const [url, setUrl] = useState("");
	useEffect(() => {
		if (!file) {
			setUrl("");
			return;
		}
		const next = URL.createObjectURL(file);
		setUrl(next);
		return () => URL.revokeObjectURL(next);
	}, [file]);
	return url;
}

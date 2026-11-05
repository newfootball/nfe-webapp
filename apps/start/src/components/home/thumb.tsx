import { useEffect, useRef, useState } from "react";

export function Thumb({
	src,
	className = "",
	lazy = false,
}: {
	src: string;
	className?: string;
	lazy?: boolean;
}) {
	const ref = useRef<HTMLImageElement>(null);
	const [failed, setFailed] = useState(false);
	// An SSR image can fail before hydration attaches onError.
	useEffect(() => {
		const img = ref.current;
		if (img?.complete && img.naturalWidth === 0) setFailed(true);
	}, []);
	if (failed) return null;
	return (
		<img
			ref={ref}
			src={src}
			alt=""
			loading={lazy ? "lazy" : undefined}
			onError={() => setFailed(true)}
			className={className}
		/>
	);
}

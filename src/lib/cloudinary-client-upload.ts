interface CloudinaryUploadSignature {
	signature: string;
	timestamp: number;
	cloudName: string;
	apiKey: string;
	folder: string;
	resourceType: "image" | "video";
}

interface CloudinaryUploadResult {
	public_id: string;
	secure_url: string;
	url: string;
	resource_type: string;
	format: string;
	width?: number;
	height?: number;
	duration?: number;
}

export function uploadToCloudinaryDirect(
	file: File,
	sig: CloudinaryUploadSignature,
	onProgress?: (percent: number) => void,
): Promise<CloudinaryUploadResult> {
	return new Promise((resolve, reject) => {
		const formData = new FormData();
		formData.append("file", file);
		formData.append("api_key", sig.apiKey);
		formData.append("timestamp", String(sig.timestamp));
		formData.append("signature", sig.signature);
		formData.append("folder", sig.folder);

		const xhr = new XMLHttpRequest();

		xhr.upload.addEventListener("progress", (e) => {
			const total = e.lengthComputable ? e.total : file.size;
			if (total > 0) {
				onProgress?.(Math.round((e.loaded / total) * 100));
			}
		});

		xhr.addEventListener("load", () => {
			if (xhr.status === 200) {
				resolve(JSON.parse(xhr.responseText) as CloudinaryUploadResult);
			} else {
				const body = JSON.parse(xhr.responseText) as {
					error?: { message: string };
				};
				reject(new Error(body.error?.message ?? "Upload failed"));
			}
		});

		xhr.addEventListener("error", () => reject(new Error("Upload failed")));
		xhr.addEventListener("abort", () => reject(new Error("Upload aborted")));

		xhr.open(
			"POST",
			`https://api.cloudinary.com/v1_1/${sig.cloudName}/${sig.resourceType}/upload`,
		);
		xhr.send(formData);
	});
}

"use client";

import { Eye, EyeOff } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Button } from "./button";
import { Input } from "./input";
import { Label } from "./label";

export const Password = ({
	label,
	...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => {
	const [showPassword, setShowPassword] = useState(false);
	return (
		<div className="grid gap-2 my-2">
			<div className="flex items-center">
				<Label htmlFor="password">{label}</Label>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="ml-auto h-auto p-0"
					onClick={() => setShowPassword(!showPassword)}
				>
					{showPassword ? (
						<EyeOff className="h-4 w-4" />
					) : (
						<Eye className="h-4 w-4" />
					)}
				</Button>
			</div>
			<Input
				{...props}
				autoComplete="current-password"
				type={showPassword ? "text" : "password"}
				required
			/>
		</div>
	);
};

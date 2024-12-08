"use client";

import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserType } from "@prisma/client";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type ControllerRenderProps, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const userTypeSchema = z.object({
	userType: z.enum(["USER", "PLAYER", "COACH", "RECRUITER", "CLUB"] as const),
});

const baseInfoSchema = z.object({
	birthDate: z.date(),
	city: z.string().min(2),
});

const playerInfoSchema = baseInfoSchema.extend({
	position: z.string().min(2),
	foot: z.enum(["LEFT", "RIGHT", "BOTH"]),
	license: z.string().optional(),
});

const coachInfoSchema = baseInfoSchema.extend({
	clubName: z.string().min(2),
});

const clubInfoSchema = baseInfoSchema.extend({
	clubName: z.string().min(2),
	clubSize: z.number().min(1),
	clubPosition: z.string().min(2),
});

type UserTypeValues = z.infer<typeof userTypeSchema>;
type PlayerInfoValues = z.infer<typeof playerInfoSchema>;
type CoachInfoValues = z.infer<typeof coachInfoSchema>;
type ClubInfoValues = z.infer<typeof clubInfoSchema>;

export function OnboardingSteps() {
	const [step, setStep] = useState(1);
	const [userType, setUserType] = useState<UserType>();
	const router = useRouter();

	const userTypeForm = useForm<UserTypeValues>({
		resolver: zodResolver(userTypeSchema),
	});

	const playerForm = useForm<PlayerInfoValues>({
		resolver: zodResolver(playerInfoSchema),
	});

	const coachForm = useForm<CoachInfoValues>({
		resolver: zodResolver(coachInfoSchema),
	});

	const clubForm = useForm<ClubInfoValues>({
		resolver: zodResolver(clubInfoSchema),
	});

	const onUserTypeSubmit = async (data: UserTypeValues) => {
		setUserType(data.userType as UserType);
		setStep(2);
	};

	const onFinalSubmit = async (
		data: PlayerInfoValues | CoachInfoValues | ClubInfoValues,
	) => {
		try {
			const response = await fetch("/api/onboarding", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					userType,
					...data,
				}),
			});

			if (!response.ok) throw new Error();

			router.push("/feed");
		} catch (error) {
			console.error(error);
			toast.error("Something went wrong");
		}
	};

	if (step === 1) {
		return (
			<Form {...userTypeForm}>
				<form
					onSubmit={userTypeForm.handleSubmit(onUserTypeSubmit)}
					className="space-y-4"
				>
					<FormField
						control={userTypeForm.control}
						name="userType"
						render={({
							field,
						}: {
							field: ControllerRenderProps<UserTypeValues>;
						}) => (
							<FormItem>
								<FormLabel>I am a...</FormLabel>
								<Select
									onValueChange={field.onChange}
									defaultValue={field.value}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select your role" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="USER">Fan</SelectItem>
										<SelectItem value="PLAYER">Player</SelectItem>
										<SelectItem value="COACH">Coach</SelectItem>
										<SelectItem value="TRAINER">Trainer</SelectItem>
										<SelectItem value="CLUB">Club</SelectItem>
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" className="w-full">
						Continue
					</Button>
				</form>
			</Form>
		);
	}

	if (userType === "PLAYER") {
		return (
			<Form {...playerForm}>
				<form
					onSubmit={playerForm.handleSubmit(onFinalSubmit)}
					className="space-y-4"
				>
					<FormField
						control={playerForm.control}
						name="birthDate"
						render={({
							field,
						}: {
							field: ControllerRenderProps<PlayerInfoValues>;
						}) => (
							<FormItem className="flex flex-col">
								<FormLabel>Date of birth</FormLabel>
								<Popover>
									<PopoverTrigger asChild>
										<FormControl>
											<Button
												variant={"outline"}
												className={cn(
													"w-full pl-3 text-left font-normal",
													!field.value && "text-muted-foreground",
												)}
											>
												{field.value ? (
													format(field.value, "PPP")
												) : (
													<span>Pick a date</span>
												)}
												<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
											</Button>
										</FormControl>
									</PopoverTrigger>
									<PopoverContent className="w-auto p-0" align="start">
										<Input
											type="date"
											placeholder="Select a date"
											value={
												field.value
													? format(field.value, "yyyy-MM-dd")
													: undefined
											}
											onChange={(e) => field.onChange(new Date(e.target.value))}
										/>
									</PopoverContent>
								</Popover>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={playerForm.control}
						name="city"
						render={({
							field,
						}: {
							field: ControllerRenderProps<PlayerInfoValues>;
						}) => (
							<FormItem>
								<FormLabel>City</FormLabel>
								<FormControl>
									<Input
										type="text"
										placeholder="Enter your city"
										value={field.value as string}
										onChange={field.onChange}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={playerForm.control}
						name="position"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Position</FormLabel>
								<Select
									onValueChange={field.onChange}
									defaultValue={field.value}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select your position" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="GOALKEEPER">Goalkeeper</SelectItem>
										<SelectItem value="DEFENDER">Defender</SelectItem>
										<SelectItem value="MIDFIELDER">Midfielder</SelectItem>
										<SelectItem value="FORWARD">Forward</SelectItem>
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={playerForm.control}
						name="foot"
						render={({
							field,
						}: {
							field: ControllerRenderProps<PlayerInfoValues>;
						}) => (
							<FormItem>
								<FormLabel>Preferred Foot</FormLabel>
								<Select
									onValueChange={field.onChange}
									defaultValue={field.value as string}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder="Select your preferred foot" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="LEFT">Left</SelectItem>
										<SelectItem value="RIGHT">Right</SelectItem>
										<SelectItem value="BOTH">Both</SelectItem>
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={playerForm.control}
						name="license"
						render={({
							field,
						}: {
							field: ControllerRenderProps<PlayerInfoValues>;
						}) => (
							<FormItem>
								<FormLabel>License Number (Optional)</FormLabel>
								<FormControl>
									<Input
										type="text"
										placeholder="Enter your license number"
										value={field.value as string}
										onChange={field.onChange}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" className="w-full">
						Complete Profile
					</Button>
				</form>
			</Form>
		);
	}

	if (userType === UserType.COACH || userType === UserType.RECRUITER) {
		return (
			<Form {...coachForm}>
				<form
					onSubmit={coachForm.handleSubmit(onFinalSubmit)}
					className="space-y-4"
				>
					<FormField
						control={coachForm.control}
						name="birthDate"
						render={({ field }) => (
							<FormItem className="flex flex-col">
								<FormLabel>Date of birth</FormLabel>
								<Popover>
									<PopoverTrigger asChild>
										<FormControl>
											<Button
												variant={"outline"}
												className={cn(
													"w-full pl-3 text-left font-normal",
													!field.value && "text-muted-foreground",
												)}
											>
												{field.value ? (
													format(field.value, "PPP")
												) : (
													<span>Pick a date</span>
												)}
												<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
											</Button>
										</FormControl>
									</PopoverTrigger>
									<PopoverContent className="w-auto p-0" align="start">
										<Input
											type="date"
											placeholder="Select a date"
											value={
												field.value
													? format(field.value, "yyyy-MM-dd")
													: undefined
											}
											onChange={(e) => field.onChange(new Date(e.target.value))}
										/>
									</PopoverContent>
								</Popover>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={coachForm.control}
						name="city"
						render={({ field }) => (
							<FormItem>
								<FormLabel>City</FormLabel>
								<FormControl>
									<Input placeholder="Enter your city" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={coachForm.control}
						name="clubName"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Club Name</FormLabel>
								<FormControl>
									<Input placeholder="Enter your club name" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" className="w-full">
						Complete Profile
					</Button>
				</form>
			</Form>
		);
	}

	if (userType === UserType.CLUB) {
		return (
			<Form {...clubForm}>
				<form
					onSubmit={clubForm.handleSubmit(onFinalSubmit)}
					className="space-y-4"
				>
					<FormField
						control={clubForm.control}
						name="clubName"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Club Name</FormLabel>
								<FormControl>
									<Input placeholder="Enter your club name" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={clubForm.control}
						name="city"
						render={({ field }) => (
							<FormItem>
								<FormLabel>City</FormLabel>
								<FormControl>
									<Input placeholder="Enter your city" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={clubForm.control}
						name="clubSize"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Number of Members</FormLabel>
								<FormControl>
									<Input
										type="number"
										placeholder="Enter club size"
										{...field}
										onChange={(e) =>
											field.onChange(Number.parseInt(e.target.value, 10))
										}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={clubForm.control}
						name="clubPosition"
						render={({ field }) => (
							<FormItem>
								<FormLabel>League Position</FormLabel>
								<FormControl>
									<Input placeholder="Enter your league position" {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" className="w-full">
						Complete Profile
					</Button>
				</form>
			</Form>
		);
	}

	return null;
}

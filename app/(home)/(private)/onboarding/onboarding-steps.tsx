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
import { useTranslations } from "next-intl";
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
	const t = useTranslations("onboarding");
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
			toast.error(t("something-went-wrong"));
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
								<FormLabel>{t("i-am-a")}</FormLabel>
								<Select
									onValueChange={field.onChange}
									defaultValue={field.value}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder={t("select-your-role")} />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="USER">{t("fan")}</SelectItem>
										<SelectItem value="PLAYER">{t("player")}</SelectItem>
										<SelectItem value="COACH">{t("coach")}</SelectItem>
										<SelectItem value="TRAINER">{t("trainer")}</SelectItem>
										<SelectItem value="CLUB">{t("club")}</SelectItem>
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" className="w-full">
						{t("continue")}
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
								<FormLabel>{t("date-of-birth")}</FormLabel>
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
													<span>{t("pick-a-date")}</span>
												)}
												<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
											</Button>
										</FormControl>
									</PopoverTrigger>
									<PopoverContent className="w-auto p-0" align="start">
										<Input
											type="date"
											placeholder={t("select-a-date")}
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
								<FormLabel>{t("city")}</FormLabel>
								<FormControl>
									<Input
										type="text"
										placeholder={t("enter-your-city")}
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
								<FormLabel>{t("position")}</FormLabel>
								<Select
									onValueChange={field.onChange}
									defaultValue={field.value}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue placeholder={t("select-your-position")} />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="GOALKEEPER">
											{t("goalkeeper")}
										</SelectItem>
										<SelectItem value="DEFENDER">{t("defender")}</SelectItem>
										<SelectItem value="MIDFIELDER">
											{t("midfielder")}
										</SelectItem>
										<SelectItem value="FORWARD">{t("forward")}</SelectItem>
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
								<FormLabel>{t("preferred-foot")}</FormLabel>
								<Select
									onValueChange={field.onChange}
									defaultValue={field.value as string}
								>
									<FormControl>
										<SelectTrigger>
											<SelectValue
												placeholder={t("select-your-preferred-foot")}
											/>
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										<SelectItem value="LEFT">{t("left")}</SelectItem>
										<SelectItem value="RIGHT">{t("right")}</SelectItem>
										<SelectItem value="BOTH">{t("both")}</SelectItem>
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
								<FormLabel>{t("license-number-optional")}</FormLabel>
								<FormControl>
									<Input
										type="text"
										placeholder={t("enter-your-license-number")}
										value={field.value as string}
										onChange={field.onChange}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" className="w-full">
						{t("complete-profile")}
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
								<FormLabel>{t("date-of-birth")}</FormLabel>
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
													<span>{t("pick-a-date")}</span>
												)}
												<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
											</Button>
										</FormControl>
									</PopoverTrigger>
									<PopoverContent className="w-auto p-0" align="start">
										<Input
											type="date"
											placeholder={t("select-a-date")}
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
								<FormLabel>{t("city")}</FormLabel>
								<FormControl>
									<Input placeholder={t("enter-your-city")} {...field} />
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
								<FormLabel>{t("club-name")}</FormLabel>
								<FormControl>
									<Input placeholder={t("enter-your-club-name")} {...field} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" className="w-full">
						{t("complete-profile")}
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
								<FormLabel>{t("club-name")}</FormLabel>
								<FormControl>
									<Input placeholder={t("enter-your-club-name")} {...field} />
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
								<FormLabel>{t("city")}</FormLabel>
								<FormControl>
									<Input placeholder={t("enter-your-city")} {...field} />
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
								<FormLabel>{t("number-of-members")}</FormLabel>
								<FormControl>
									<Input
										type="number"
										placeholder={t("enter-club-size")}
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
								<FormLabel>{t("league-position")}</FormLabel>
								<FormControl>
									<Input
										placeholder={t("enter-your-league-position")}
										{...field}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<Button type="submit" className="w-full">
						{t("complete-profile")}
					</Button>
				</form>
			</Form>
		);
	}

	return null;
}

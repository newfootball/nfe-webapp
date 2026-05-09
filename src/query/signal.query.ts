"use server";

import { prisma } from "@/lib/prisma";
import type { SignalStatus } from "@/src/generated/prisma/client";

export const getSignals = async (status?: SignalStatus) => {
	return prisma.postSignal.findMany({
		where: status ? { status } : undefined,
		orderBy: { createdAt: "desc" },
		include: {
			post: {
				select: {
					id: true,
					title: true,
					status: true,
					medias: {
						take: 1,
						select: { url: true },
					},
				},
			},
			user: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	});
};

export const getPendingSignalCount = async () => {
	return prisma.postSignal.count({ where: { status: "PENDING" } });
};

export type SignalWithRelations = Awaited<
	ReturnType<typeof getSignals>
>[number];

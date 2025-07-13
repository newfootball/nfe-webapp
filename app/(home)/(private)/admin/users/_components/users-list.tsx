"use client";

import { getUsers } from "@/src/query/user.query";
import { User } from "@prisma/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

export default function UsersList() {
	const [page, setPage] = useState(1);
	const limit = 10;

	const {
		data: users,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["users", page, limit],
		queryFn: () => getUsers({ page, limit }),
	});

	if (isLoading)
		return (
			<div className="flex items-center justify-center h-40">
				<span className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mr-2"></span>
				<span className="text-gray-700">Chargement…</span>
			</div>
		);

	if (isError)
		return (
			<div className="flex items-center justify-center h-40 text-red-600 font-semibold">
				Erreur lors du chargement
			</div>
		);

	return (
		<div className="w-full max-w-3xl mx-auto mt-8">
			<h2 className="text-2xl font-bold mb-4 text-gray-800">Utilisateurs</h2>
			<div className="overflow-x-auto">
				<table className="min-w-full divide-y divide-gray-200">
					<thead className="bg-gray-50">
						<tr>
							<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Nom
							</th>
							<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Email
							</th>
						</tr>
					</thead>
					<tbody className="bg-white divide-y divide-gray-100">
						{users?.map((user: User) => (
							<tr key={user.id} className="hover:bg-gray-50 transition-colors">
								<td className="px-4 py-2 text-gray-800">{user.name}</td>
								<td className="px-4 py-2 text-gray-600">{user.email}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className="flex items-center justify-between mt-6">
				<button
					onClick={() => setPage((p) => Math.max(1, p - 1))}
					disabled={page === 1}
					className={`px-4 py-2 rounded-md border border-gray-300 bg-gray-100 text-gray-700 font-medium transition-colors hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed`}
				>
					Précédent
				</button>
				<span className="text-gray-700 font-semibold">Page {page}</span>
				<button
					onClick={() =>
						setPage((p) => (users && users.length === limit ? p + 1 : p))
					}
					disabled={users && users.length < limit}
					className={`px-4 py-2 rounded-md border border-gray-300 bg-gray-100 text-gray-700 font-medium transition-colors hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed`}
				>
					Suivant
				</button>
			</div>
		</div>
	);
}

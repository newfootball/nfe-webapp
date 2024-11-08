import { faker } from "@faker-js/faker/locale/fr";
import { Prisma, PrismaClient } from "@prisma/client";
import { randomizer } from "../../src/lib/array";

export const seedMedias = async ({
  prisma,
  posts,
}: {
  prisma: PrismaClient;
  posts: Prisma.PostUncheckedCreateInput[];
}) => {
  const medias: Prisma.MediaUncheckedCreateInput[] = [];

  for (let post of posts) {
    const dbMedia = await prisma.media.create({
      data: {
        postId: post.id!,
        url: video(),
        mimetype: "video/mp4",
        filename: faker.word.words(),
        createdAt: faker.date.past(),
      },
    });

    medias.push(dbMedia);
  }

  return medias;
};

const video = () => {
  return randomizer([
    "http://localhost:9001/api/v1/download-shared-object/aHR0cDovLzEyNy4wLjAuMTo5MDAwL2xvY2FsLW5mZS9TY3JlZW4lMjBSZWNvcmRpbmclMjAyMDI0LTA5LTExJTIwYXQlMjAxMy4yNi4wOC5tb3Y_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD0yWUswSFQxTldJMzdUTjRTMzg0MyUyRjIwMjQwOTExJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI0MDkxMVQxMjMwMDdaJlgtQW16LUV4cGlyZXM9NDMxOTQmWC1BbXotU2VjdXJpdHktVG9rZW49ZXlKaGJHY2lPaUpJVXpVeE1pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmhZMk5sYzNOTFpYa2lPaUl5V1Vzd1NGUXhUbGRKTXpkVVRqUlRNemcwTXlJc0ltVjRjQ0k2TVRjeU5qRXdNREV6TVN3aWNHRnlaVzUwSWpvaVFVdEpRVWxQVTBaUFJFNU9OMFZZUVUxUVRFVWlmUS5BZUtTVWY0NjVHbm9DZkRGWHlLbEtaNTJxYlZsOV91bnNOWmdTcTFwY2JEQ1ZBeVlQS0FINVhuZEJBeV9RRUltRVY4N0F3WFExMTMxenFqUGRVVnhtUSZYLUFtei1TaWduZWRIZWFkZXJzPWhvc3QmdmVyc2lvbklkPW51bGwmWC1BbXotU2lnbmF0dXJlPTk3ZmE5YmY0ZGNkMTIyOTM3OTU1YWFlNDNjNThiOWUwYjgyMzZmMDhiN2IxNjU4ZjQ1OTg2Y2UxMTFiOTE5ZTY",
    "http://localhost:9001/api/v1/download-shared-object/aHR0cDovLzEyNy4wLjAuMTo5MDAwL2xvY2FsLW5mZS9TY3JlZW4lMjBSZWNvcmRpbmclMjAyMDI0LTA5LTExJTIwYXQlMjAxMy4zMy4wMi5tb3Y_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD0yWUswSFQxTldJMzdUTjRTMzg0MyUyRjIwMjQwOTExJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI0MDkxMVQxMjM3MjhaJlgtQW16LUV4cGlyZXM9NDMxOTkmWC1BbXotU2VjdXJpdHktVG9rZW49ZXlKaGJHY2lPaUpJVXpVeE1pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmhZMk5sYzNOTFpYa2lPaUl5V1Vzd1NGUXhUbGRKTXpkVVRqUlRNemcwTXlJc0ltVjRjQ0k2TVRjeU5qRXdNREV6TVN3aWNHRnlaVzUwSWpvaVFVdEpRVWxQVTBaUFJFNU9OMFZZUVUxUVRFVWlmUS5BZUtTVWY0NjVHbm9DZkRGWHlLbEtaNTJxYlZsOV91bnNOWmdTcTFwY2JEQ1ZBeVlQS0FINVhuZEJBeV9RRUltRVY4N0F3WFExMTMxenFqUGRVVnhtUSZYLUFtei1TaWduZWRIZWFkZXJzPWhvc3QmdmVyc2lvbklkPW51bGwmWC1BbXotU2lnbmF0dXJlPWE3Mjk4Nzg4YTA2ZjBiNDRkOTI2OTc3MGUxMmExY2Q0M2UzYmU1ZWRjYmZkNGQ4NTJjYzVmYjc5YTY4ODI5Mzg",
  ]);
};

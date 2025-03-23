import { faker } from "@faker-js/faker/locale/fr";
import type { Media, Prisma, PrismaClient } from "@prisma/client";
import { randomizer } from "../../src/lib/array";

export const seedMedias = async ({
  prisma,
  posts,
}: {
  prisma: PrismaClient;
  posts: Prisma.PostUncheckedCreateInput[];
}) => {
  const medias: Media[] = [];

  for (const post of posts) {
    if (!post.id) continue;

    const data = {
      postId: post.id,
      mimetype: "video/mp4",
      filename: faker.word.words(),
      createdAt: faker.date.past(),
    };

    const { video, image } = randomVideo();

    const dbVideo = await prisma.media.create({
      data: {
        ...data,
        ...{
          url: video,
          mimetype: "video/mp4",
          metadata: {
            video: {
              duration: 100,
            },
          },
        },
      },
    });

    const dbImage = await prisma.media.create({
      data: {
        ...data,
        ...{
          url: image,
          mimetype: "image/jpeg",
          metadata: {
            image: {
              width: 100,
              height: 100,
            },
          },
        },
      },
    });

    medias.push(dbVideo, dbImage);
  }

  return medias;
};

const randomVideo = (): { video: string; image: string } => {
  return randomizer([
    {
      video:
        "https://console-oog0coc0cc4ccss80ocwckk4.145.223.81.185.sslip.io/api/v1/download-shared-object/aHR0cHM6Ly9taW5pby1vb2cwY29jMGNjNGNjc3M4MG9jd2NrazQuMTQ1LjIyMy44MS4xODUuc3NsaXAuaW8vbmZlLXdlYmFwcC9DJTI3ZXN0JTIwbGUlMjBHRU5JRSUyMGR1JTIwZm9vdGJhbGwlMjBhbWF0ZXVyJTIwJUYwJTlGJUFBJTg0JTIwJTIwLSUyMExlJTIwWkFQJTIwZHUlMjB3ZWVrLWVuZCUyMCUyODIwJUUyJUE3JUI4MDklMjkubXA0P1gtQW16LUFsZ29yaXRobT1BV1M0LUhNQUMtU0hBMjU2JlgtQW16LUNyZWRlbnRpYWw9WkFaNzdNT0ZEWjBYQjNFSlM5R0ElMkYyMDI0MTIwMSUyRnVzLWVhc3QtMSUyRnMzJTJGYXdzNF9yZXF1ZXN0JlgtQW16LURhdGU9MjAyNDEyMDFUMTgzMDU4WiZYLUFtei1FeHBpcmVzPTQzMjAwJlgtQW16LVNlY3VyaXR5LVRva2VuPWV5SmhiR2NpT2lKSVV6VXhNaUlzSW5SNWNDSTZJa3BYVkNKOS5leUpoWTJObGMzTkxaWGtpT2lKYVFWbzNOMDFQUmtSYU1GaENNMFZLVXpsSFFTSXNJbVY0Y0NJNk1UY3pNekV5TURZMU1Dd2ljR0Z5Wlc1MElqb2libVpsSW4wLjVPWlhlRlROd3NpTjJqenROOWlkbTh3NnJZbjhNV3RRNHhpZFpNMGN5UE1XaFVSNGxXNHptVzJiNExMMXpNYmEzc0lxcTMtajJSUlVWYVVHQzMyVEZ3JlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCZ2ZXJzaW9uSWQ9bnVsbCZYLUFtei1TaWduYXR1cmU9MGVlZDVlMmIyYTIyZDg0ZTMzNzQ0ZTM1MDQ5YjUwMjQ5MDg2MjQxYjg1NzI2NDQ2MmI2MDAxOWRkMDliODAwOQ",
      image:
        "https://images.unsplash.com/photo-1504305754058-2f08ccd89a0a?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      video:
        "https://console-oog0coc0cc4ccss80ocwckk4.145.223.81.185.sslip.io/api/v1/buckets/nfe-webapp/objects/download?preview=true&prefix=C%27est%20le%20GENIE%20du%20football%20amateur%20%F0%9F%AA%84%20%20-%20Le%20ZAP%20du%20week-end%20(20%E2%A7%B809).mp4",
      image:
        "https://images.unsplash.com/photo-1504305754058-2f08ccd89a0a?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
    {
      video:
        "https://console-oog0coc0cc4ccss80ocwckk4.145.223.81.185.sslip.io/api/v1/download-shared-object/aHR0cHM6Ly9taW5pby1vb2cwY29jMGNjNGNjc3M4MG9jd2NrazQuMTQ1LjIyMy44MS4xODUuc3NsaXAuaW8vbmZlLXdlYmFwcC9DJTI3ZXN0JTIwbGUlMjBHRU5JRSUyMGR1JTIwZm9vdGJhbGwlMjBhbWF0ZXVyJTIwJUYwJTlGJUFBJTg0JTIwJTIwLSUyMExlJTIwWkFQJTIwZHUlMjB3ZWVrLWVuZCUyMCUyODIwJUUyJUE3JUI4MDklMjklMjAlMjgzJTI5Lm1wND9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPVpBWjc3TU9GRFowWEIzRUpTOUdBJTJGMjAyNDEyMDElMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjQxMjAxVDIwMDEzN1omWC1BbXotRXhwaXJlcz00MzIwMCZYLUFtei1TZWN1cml0eS1Ub2tlbj1leUpoYkdjaU9pSklVelV4TWlJc0luUjVjQ0k2SWtwWFZDSjkuZXlKaFkyTmxjM05MWlhraU9pSmFRVm8zTjAxUFJrUmFNRmhDTTBWS1V6bEhRU0lzSW1WNGNDSTZNVGN6TXpFeU1EWTFNQ3dpY0dGeVpXNTBJam9pYm1abEluMC41T1pYZUZUTndzaU4yanp0TjlpZG04dzZyWW44TVd0UTR4aWRaTTBjeVBNV2hVUjRsVzR6bVcyYjRMTDF6TWJhM3NJcXEzLWoyUlJVVmFVR0MzMlRGdyZYLUFtei1TaWduZWRIZWFkZXJzPWhvc3QmdmVyc2lvbklkPW51bGwmWC1BbXotU2lnbmF0dXJlPTEwNDFmZGQxNThhMTNlZmY0MDJiYmU2MGE4YzEwNWNmMDIxMGQwMjRhNzQ5OGE1ZmE3NGI4ZDA5Zjg2MzhlYzg",
      image:
        "https://images.unsplash.com/photo-1504305754058-2f08ccd89a0a?q=80&w=2940&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    },
  ]) as { video: string; image: string };
};

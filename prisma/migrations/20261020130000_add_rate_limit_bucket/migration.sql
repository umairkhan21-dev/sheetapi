-- CreateTable
CREATE TABLE `RateLimitBucket` (
    `id` VARCHAR(128) NOT NULL,
    `count` INTEGER NOT NULL,
    `resetAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

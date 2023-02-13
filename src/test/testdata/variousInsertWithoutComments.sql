INSERT INTO `Users`
(
  `Id`,
  `Name`,
  `Address`,
  `IsInSale`,
  `RegisterdAt`,
  `Count`,
  `MailAddress`,
  `Is_active`
)
VALUES(
  1,
  'Barrel',
  NULL,
  TRUE,
  now(),
  2,
  'abcdefghijklmn@aamail.com',
  false
),
(
  10000,
  'Sato',
  'Tokyo Bunkyo Koishikawa',
  false,
  `2021-09-17 00:00:00`,
  1,
  'abcdecdjmn@ajfds.com',
  TRUE
);
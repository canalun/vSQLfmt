INSERT INTO `Users`
(
  `Id`,
  `Name`,
  `Address`,
  `IsInSale`,
  `Balance`,
  `Count`,
  `MailAddress`,
  `Is_active`,
  `Created_at`
)
VALUES(
  1,
  'Barrel',
  NULL,
  TRUE,
  1000000,
  2,
  'abcdefghijklmn@aaamail.com',
  false,
  now()
),
(
  1000000,
  'Sato',
  'Tokyo Bunkyo Koishikawa',
  false,
  -6500,
  1,
  'abcdefghijklcdefghijmn@ajfds.com',
  TRUE,
  '2021-09-17 00:00:00'
);

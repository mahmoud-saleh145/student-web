import { translate, type Language } from '../i18n/dictionaries.ts';

/**
 * The activation portal's own words.
 *
 * Everything the portal shares with the rest of Student Center — "Courses",
 * "Library", "Free preview", the access states, every error sentence — is
 * read from the platform dictionary, so the portal speaks the same language as
 * the app and the website. Only what exists nowhere else lives here: the
 * activation flow, the "open it in the app" wording, and the success screens.
 *
 * Kept in its own file rather than added to the platform dictionary so the
 * portal can be read, changed or lifted out on its own.
 *
 * Wording rule for this tree: nothing here says watch, play, read, open a
 * lesson or continue learning as something the student does on this site.
 * Those happen in the app; the portal says so.
 */

const en = {
  'act.portalName': 'Activation portal',
  'act.nav.home': 'Home',
  'act.nav.activations': 'My activations',
  'act.nav.account': 'Account',
  'act.footer.note': 'Lessons and documents open in the Student Center app. This portal only activates them.',

  'act.login.title': 'Activation portal',
  'act.login.subtitle': 'Sign in with your Student Center account to activate courses and library materials.',
  'act.login.sameAccount': 'Use the same phone number and password as the app.',
  'act.login.point.activate': 'Activate a course or a course part with your access code',
  'act.login.point.library': 'Top up your credit and get library materials',
  'act.login.point.app': 'Then study everything in the Student Center app',
  'act.login.deviceNote': 'Signing in here does not register this browser as a device and does not sign you out of your phone.',
  'act.login.forgot': 'Forgot your password? Contact the administration — passwords are reset by the administration only.',
  'act.login.studentsOnly': 'This portal is for student accounts only.',

  'act.home.greeting': 'Hello, {name}',
  'act.home.subtitle': 'Activate your courses and library materials here, then study in the app.',
  'act.home.courses.body': 'Browse your courses, see what each one includes, and activate with a code.',
  'act.home.library.body': 'Books and revision papers for your faculty, bought with credit.',
  'act.home.activations.body': 'Everything already activated on your account.',
  'act.home.wallet.body': 'Your credit balance and recharge cards.',
  'act.home.account.body': 'Your details, language and sign out.',
  'act.home.howTitle': 'How it works',
  'act.home.step1.title': 'Choose',
  'act.home.step1.body': 'Find your course or library material.',
  'act.home.step2.title': 'Activate',
  'act.home.step2.body': 'Enter your access code, or buy library materials with credit.',
  'act.home.step3.title': 'Study in the app',
  'act.home.step3.body': 'Open Student Center on your phone. Your content is already there.',
  'act.home.balance': 'Credit balance',

  'act.courses.subtitle': 'Pick a course to see what it includes and activate it with your code.',
  'act.course.details': 'Details and activation',
  'act.course.outline': 'Course outline',
  'act.course.outlineNote': 'This is what the course contains. Lessons are watched in the Student Center app.',
  'act.course.materialsNote': 'Course files are opened in the Student Center app.',
  'act.course.files': 'Files',
  'act.course.lessons': '{count} lessons',
  'act.course.sections': '{count} sections',
  'act.course.video': 'Video',
  'act.course.document': 'Document',
  'act.course.quiz': 'Quiz',
  'act.course.live': 'Live',
  'act.course.pricesTitle': 'Prices',
  'act.course.fullPrice': 'Full course',
  'act.course.priceUnset': 'Ask the administration',
  'act.course.includedParts': 'Course parts',
  'act.course.notOnOffer': 'This course is not open for activation right now.',
  'act.course.codesNotAccepted': 'This course does not accept access codes.',
  'act.course.inAppOnly': 'In the app',

  'act.own.full.title': 'You own the full course',
  'act.own.full.body': 'Everything in this course is unlocked on your account. Open the app to study.',
  'act.own.parts.title': 'You own {owned} of {total} parts',
  'act.own.parts.body': 'You can unlock another part, or the full course, with a code.',
  'act.own.sections.title': 'You have access to part of this course',
  'act.own.sections.body': 'Some sections are unlocked on your account. A code can unlock more.',
  'act.own.active.title': 'This course is active on your account',
  'act.own.partOwned': 'Owned',
  'act.own.partViaFull': 'Included in full course',
  'act.own.partLocked': 'Not owned',
  'act.own.sectionOpen': 'Unlocked',
  'act.own.sectionLocked': 'Locked',

  'act.code.title': 'Activate with a code',
  'act.code.hint': 'Enter the code printed on your card. The card itself decides what it unlocks — the full course or one part.',
  'act.code.submit': 'Activate',
  'act.code.checking': 'Checking the code…',
  'act.code.activating': 'Activating…',
  'act.code.required': 'Enter the code from your card.',
  'act.code.format': 'A code has letters, numbers and dashes only.',
  'act.code.otherWays': 'Other ways to join',
  'act.code.joinFree': 'Join for free',
  'act.code.requestApproval': 'Request access',

  'act.err.rechargeOnCourse': 'This is a recharge card, not a course code. Use it in Credit to top up your balance.',
  'act.err.courseOnWallet': 'This is a course access code, not a recharge card. Open the course and enter it there.',
  'act.err.invalidCourseCode': 'This code is not valid for this course. Check the code, and that it was issued for this course.',
  'act.err.invalidRecharge': 'This recharge code is not valid.',
  'act.err.codeUsed': 'This code has already been used.',
  'act.err.partUnavailable': 'The part this card is for is not available right now. Your card was not used.',
  'act.err.alreadyOwned': 'You already have everything this card unlocks. Your card was not used.',
  'act.err.rateLimited': 'Too many attempts. Wait a few minutes, then try again.',
  'act.err.unknownOutcome':
    'We could not confirm whether your card was used. Check “My activations” before entering it again.',
  'act.err.unknownOutcomeWallet':
    'We could not confirm whether your card was used. Check your balance and history below before entering it again.',
  'act.err.unexpected': 'Something unexpected happened. Refresh the page and check before trying again.',
  'act.err.goToWallet': 'Go to Credit',
  'act.err.goToCourses': 'Go to Courses',

  'act.success.title': 'Activated',
  'act.success.wholeCourse': 'The full course “{course}” is now unlocked on your account.',
  'act.success.partsIntro': 'Unlocked in “{course}”:',
  'act.success.sectionsIntro': 'Sections unlocked in “{course}”:',
  'act.success.teacherNote': 'This card may also cover other courses by {name}. See My activations.',
  'act.success.nothingNewTitle': 'Your code was accepted',
  'act.success.nothingNewBody':
    'What you can open in “{course}” is the same as before. If this card renews or extends your access, the new end date is now on your account. If you expected something else, contact the administration with your card.',
  'act.success.joined': 'You joined “{course}”.',
  'act.success.pendingTitle': 'Request sent',
  'act.success.pendingBody': 'Your request to join “{course}” was sent. You will get access when the administration approves it.',
  'act.success.rechargeTitle': 'Credit added',
  'act.success.recharge': '{amount} was added to your credit.',
  'act.success.rechargeZero': 'The card was accepted. It did not add any credit.',
  'act.success.balance': 'Balance now: {balance}',
  'act.success.libraryTitle': 'Added to your library',
  'act.success.library': 'You now own “{title}”.',
  'act.success.libraryParts': 'Documents added: {count}',
  'act.success.libraryPaid': 'Paid from credit: {amount}',
  'act.success.alreadyPurchased': 'You already owned this — nothing was charged.',
  'act.success.emptyTitle': 'No recent activation',
  'act.success.emptyBody': 'Everything activated on your account is listed in My activations.',
  'act.success.another': 'Activate something else',
  'act.success.viewActivations': 'View my activations',
  'act.success.viewCourse': 'Back to the course',

  'act.app.open': 'Open Student Center',
  'act.app.title': 'Continue in the app',
  'act.app.body': 'Open the Student Center app on your phone. What you activated is already on your account.',
  'act.app.refresh': 'If you do not see it right away, pull down to refresh in My courses or the Library.',
  'act.app.notOpened':
    'The app did not open? Open Student Center from your phone’s home screen. What you activated is already on your account.',
  'act.app.manual':
    'Open Student Center from your phone’s home screen. What you activated is already on your account.',
  'act.app.onPhone':
    'Student Center is a phone app. Open it on your phone — what you activated is already on your account.',
  'act.app.getApp': 'Get the app',

  'act.library.subtitle': 'Browse the library and buy with credit. Documents are read in the Student Center app.',
  'act.library.inApp': 'Read in the app',
  'act.library.previewInApp': 'Free preview — in the app',
  'act.library.creditOnly': 'Library materials are bought with credit. Top up with a recharge card, then buy here.',
  'act.library.noCodeNote': 'Course access codes do not work for the library.',
  'act.library.ownedDocs': 'Your documents',
  'act.library.availableInApp': 'Available in the app',
  'act.library.pages': '{count} pages',
  'act.library.about': 'About this material',
  'act.library.subject': 'Subject',
  'act.library.yearLevel': 'Year / level',
  'act.library.youOwn': 'You own',
  'act.library.accessStatus': 'Your access',

  'act.wallet.subtitle': 'Credit buys library materials. Courses are unlocked with access codes, not with credit.',
  'act.wallet.adminIssued':
    'Recharge cards are issued by the administration. There is no online payment: credit is added only by redeeming a card, or by the administration.',
  'act.wallet.totalRecharged': 'Total added',
  'act.wallet.totalSpent': 'Total spent',
  'act.wallet.tx.CREDIT_RECHARGE': 'Recharge card',
  'act.wallet.tx.PURCHASE': 'Purchase',
  'act.wallet.tx.REFUND': 'Refund',
  'act.wallet.tx.ADMIN_ADJUSTMENT': 'Administration adjustment',
  'act.wallet.tx.REVERSAL': 'Reversal',
  'act.wallet.browseLibrary': 'Browse the library',

  'act.mine.subtitle': 'Everything activated on your account. Study it in the Student Center app.',
  'act.mine.courses': 'Courses',
  'act.mine.documents': 'Library documents',
  'act.mine.full': 'Full course',
  'act.mine.partsOf': '{owned} of {total} parts',
  'act.mine.partial': 'Partial access',
  'act.mine.unlockMore': 'Unlock more',
  'act.mine.emptyCoursesTitle': 'No activated courses yet',
  'act.mine.emptyCoursesBody': 'Courses you activate will appear here.',
  'act.mine.emptyDocsTitle': 'No library documents yet',
  'act.mine.emptyDocsBody': 'Documents you buy will appear here.',
  'act.mine.browseCourses': 'Browse courses',

  'act.account.title': 'Account',
  'act.account.signOutNote': 'Signing out here does not sign you out of the app.',
  'act.account.notDevice': 'This portal is not a playback device. It never uses up your device allowance.',
  'act.account.preferences': 'Preferences',

  'act.notFound.title': 'Page not found',
  'act.notFound.home': 'Back to the portal',
} as const;

export type ActivationKey = keyof typeof en;

const ar: Record<ActivationKey, string> = {
  'act.portalName': 'بوابة التفعيل',
  'act.nav.home': 'الرئيسية',
  'act.nav.activations': 'تفعيلاتي',
  'act.nav.account': 'حسابي',
  'act.footer.note': 'الدروس والمستندات تُفتح من تطبيق Student Center. هذه البوابة للتفعيل فقط.',

  'act.login.title': 'بوابة التفعيل',
  'act.login.subtitle': 'سجّل الدخول بحسابك على Student Center لتفعيل الكورسات ومستندات المكتبة.',
  'act.login.sameAccount': 'استخدم نفس رقم الهاتف وكلمة المرور المستخدمين في التطبيق.',
  'act.login.point.activate': 'فعّل كورسًا أو جزءًا من كورس بكود الوصول',
  'act.login.point.library': 'اشحن رصيدك واحصل على مستندات المكتبة',
  'act.login.point.app': 'ثم ذاكر كل شيء من تطبيق Student Center',
  'act.login.deviceNote': 'تسجيل الدخول هنا لا يسجّل هذا المتصفح كجهاز، ولا يسجّل خروجك من هاتفك.',
  'act.login.forgot': 'نسيت كلمة المرور؟ تواصل مع الإدارة — إعادة تعيين كلمة المرور تتم عن طريق الإدارة فقط.',
  'act.login.studentsOnly': 'هذه البوابة لحسابات الطلاب فقط.',

  'act.home.greeting': 'أهلًا يا {name}',
  'act.home.subtitle': 'فعّل كورساتك ومستندات المكتبة من هنا، ثم ذاكر من التطبيق.',
  'act.home.courses.body': 'تصفّح كورساتك، واعرف محتوى كل كورس، وفعّله بالكود.',
  'act.home.library.body': 'كتب وملازم مراجعة لكليتك، تُشترى بالرصيد.',
  'act.home.activations.body': 'كل ما تم تفعيله على حسابك.',
  'act.home.wallet.body': 'رصيدك وكروت الشحن.',
  'act.home.account.body': 'بياناتك، اللغة، وتسجيل الخروج.',
  'act.home.howTitle': 'كيف تعمل البوابة',
  'act.home.step1.title': 'اختر',
  'act.home.step1.body': 'ابحث عن الكورس أو مستند المكتبة.',
  'act.home.step2.title': 'فعّل',
  'act.home.step2.body': 'أدخل كود الوصول، أو اشترِ مستندات المكتبة بالرصيد.',
  'act.home.step3.title': 'ذاكر من التطبيق',
  'act.home.step3.body': 'افتح Student Center على هاتفك. المحتوى موجود بالفعل.',
  'act.home.balance': 'الرصيد الحالي',

  'act.courses.subtitle': 'اختر كورسًا لتعرف محتواه وتفعّله بالكود.',
  'act.course.details': 'التفاصيل والتفعيل',
  'act.course.outline': 'محتوى الكورس',
  'act.course.outlineNote': 'هذا ما يحتويه الكورس. الدروس تُشاهَد من تطبيق Student Center.',
  'act.course.materialsNote': 'ملفات الكورس تُفتح من تطبيق Student Center.',
  'act.course.files': 'الملفات',
  'act.course.lessons': '{count} درس',
  'act.course.sections': '{count} قسم',
  'act.course.video': 'فيديو',
  'act.course.document': 'مستند',
  'act.course.quiz': 'اختبار',
  'act.course.live': 'مباشر',
  'act.course.pricesTitle': 'الأسعار',
  'act.course.fullPrice': 'الكورس كاملًا',
  'act.course.priceUnset': 'اسأل الإدارة',
  'act.course.includedParts': 'أجزاء الكورس',
  'act.course.notOnOffer': 'هذا الكورس غير متاح للتفعيل حاليًا.',
  'act.course.codesNotAccepted': 'هذا الكورس لا يقبل أكواد الوصول.',
  'act.course.inAppOnly': 'من التطبيق',

  'act.own.full.title': 'تمتلك الكورس كاملًا',
  'act.own.full.body': 'كل محتوى هذا الكورس مفتوح على حسابك. افتح التطبيق للمذاكرة.',
  'act.own.parts.title': 'تمتلك {owned} من {total} أجزاء',
  'act.own.parts.body': 'يمكنك فتح جزء آخر، أو الكورس كاملًا، بكود.',
  'act.own.sections.title': 'لديك وصول إلى جزء من هذا الكورس',
  'act.own.sections.body': 'بعض الأقسام مفتوحة على حسابك. يمكن فتح المزيد بكود.',
  'act.own.active.title': 'هذا الكورس مفعّل على حسابك',
  'act.own.partOwned': 'مملوك',
  'act.own.partViaFull': 'مشمول في الكورس الكامل',
  'act.own.partLocked': 'غير مملوك',
  'act.own.sectionOpen': 'مفتوح',
  'act.own.sectionLocked': 'مُقفل',

  'act.code.title': 'التفعيل بالكود',
  'act.code.hint': 'أدخل الكود المطبوع على الكرت. الكرت نفسه يحدد ما يفتحه — الكورس كاملًا أو جزءًا واحدًا.',
  'act.code.submit': 'تفعيل',
  'act.code.checking': 'جارٍ التحقق من الكود…',
  'act.code.activating': 'جارٍ التفعيل…',
  'act.code.required': 'أدخل الكود الموجود على الكرت.',
  'act.code.format': 'الكود يتكوّن من حروف وأرقام وشرطات فقط.',
  'act.code.otherWays': 'طرق أخرى للانضمام',
  'act.code.joinFree': 'انضم مجانًا',
  'act.code.requestApproval': 'اطلب الوصول',

  'act.err.rechargeOnCourse': 'هذا كرت شحن وليس كود كورس. استخدمه في شاشة الرصيد لشحن رصيدك.',
  'act.err.courseOnWallet': 'هذا كود وصول لكورس وليس كرت شحن. افتح الكورس وأدخله هناك.',
  'act.err.invalidCourseCode': 'هذا الكود غير صالح لهذا الكورس. تأكد من الكود، ومن أنه صادر لهذا الكورس.',
  'act.err.invalidRecharge': 'كود الشحن غير صالح.',
  'act.err.codeUsed': 'تم استخدام هذا الكود من قبل.',
  'act.err.partUnavailable': 'الجزء الخاص بهذا الكرت غير متاح حاليًا. لم يُستخدم الكرت.',
  'act.err.alreadyOwned': 'لديك بالفعل كل ما يفتحه هذا الكرت. لم يُستخدم الكرت.',
  'act.err.rateLimited': 'محاولات كثيرة. انتظر بضع دقائق ثم حاول مجددًا.',
  'act.err.unknownOutcome': 'تعذّر التأكد مما إذا كان الكرت قد استُخدم. راجع «تفعيلاتي» قبل إدخاله مرة أخرى.',
  'act.err.unknownOutcomeWallet':
    'تعذّر التأكد مما إذا كان الكرت قد استُخدم. راجع رصيدك والسجل بالأسفل قبل إدخاله مرة أخرى.',
  'act.err.unexpected': 'حدث شيء غير متوقع. حدّث الصفحة وتحقق قبل المحاولة مرة أخرى.',
  'act.err.goToWallet': 'اذهب إلى الرصيد',
  'act.err.goToCourses': 'اذهب إلى الكورسات',

  'act.success.title': 'تم التفعيل',
  'act.success.wholeCourse': 'الكورس «{course}» مفتوح الآن كاملًا على حسابك.',
  'act.success.partsIntro': 'تم فتحه في «{course}»:',
  'act.success.sectionsIntro': 'الأقسام التي فُتحت في «{course}»:',
  'act.success.teacherNote': 'قد يشمل هذا الكرت كورسات أخرى للمحاضر {name}. راجع تفعيلاتي.',
  'act.success.nothingNewTitle': 'تم قبول الكود',
  'act.success.nothingNewBody':
    'ما يمكنك فتحه في «{course}» لم يتغيّر. إذا كان هذا الكرت يجدّد أو يمدّ مدة وصولك، فقد سُجّل الموعد الجديد على حسابك. إذا كنت تتوقع شيئًا آخر، تواصل مع الإدارة ومعك الكرت.',
  'act.success.joined': 'انضممت إلى «{course}».',
  'act.success.pendingTitle': 'تم إرسال الطلب',
  'act.success.pendingBody': 'تم إرسال طلب انضمامك إلى «{course}». ستحصل على الوصول عند موافقة الإدارة.',
  'act.success.rechargeTitle': 'تمت إضافة الرصيد',
  'act.success.recharge': 'تمت إضافة {amount} إلى رصيدك.',
  'act.success.rechargeZero': 'تم قبول الكرت، ولم يُضِف أي رصيد.',
  'act.success.balance': 'الرصيد الآن: {balance}',
  'act.success.libraryTitle': 'أُضيف إلى مكتبتك',
  'act.success.library': 'أنت تمتلك الآن «{title}».',
  'act.success.libraryParts': 'المستندات المضافة: {count}',
  'act.success.libraryPaid': 'المدفوع من الرصيد: {amount}',
  'act.success.alreadyPurchased': 'كنت تمتلك هذا بالفعل — لم يُخصم شيء.',
  'act.success.emptyTitle': 'لا يوجد تفعيل حديث',
  'act.success.emptyBody': 'كل ما تم تفعيله على حسابك موجود في تفعيلاتي.',
  'act.success.another': 'فعّل شيئًا آخر',
  'act.success.viewActivations': 'عرض تفعيلاتي',
  'act.success.viewCourse': 'العودة إلى الكورس',

  'act.app.open': 'افتح Student Center',
  'act.app.title': 'أكمل من التطبيق',
  'act.app.body': 'افتح تطبيق Student Center على هاتفك. ما فعّلته موجود على حسابك بالفعل.',
  'act.app.refresh': 'إذا لم يظهر فورًا، اسحب الشاشة لأسفل للتحديث في كورساتي أو المكتبة.',
  'act.app.notOpened': 'لم يُفتح التطبيق؟ افتح Student Center من الشاشة الرئيسية لهاتفك. ما فعّلته موجود على حسابك بالفعل.',
  'act.app.manual': 'افتح Student Center من الشاشة الرئيسية لهاتفك. ما فعّلته موجود على حسابك بالفعل.',
  'act.app.onPhone': 'Student Center تطبيق للهاتف. افتحه على هاتفك — ما فعّلته موجود على حسابك بالفعل.',
  'act.app.getApp': 'حمّل التطبيق',

  'act.library.subtitle': 'تصفّح المكتبة واشترِ بالرصيد. المستندات تُقرأ من تطبيق Student Center.',
  'act.library.inApp': 'تُقرأ من التطبيق',
  'act.library.previewInApp': 'معاينة مجانية — من التطبيق',
  'act.library.creditOnly': 'مستندات المكتبة تُشترى بالرصيد. اشحن رصيدك بكرت شحن، ثم اشترِ من هنا.',
  'act.library.noCodeNote': 'أكواد وصول الكورسات لا تعمل في المكتبة.',
  'act.library.ownedDocs': 'مستنداتك',
  'act.library.availableInApp': 'متاح في التطبيق',
  'act.library.pages': '{count} صفحة',
  'act.library.about': 'عن هذا المستند',
  'act.library.subject': 'المادة',
  'act.library.yearLevel': 'الفرقة / المستوى',
  'act.library.youOwn': 'تمتلك',
  'act.library.accessStatus': 'حالة وصولك',

  'act.wallet.subtitle': 'الرصيد يُستخدم لشراء مستندات المكتبة. الكورسات تُفتح بأكواد الوصول، لا بالرصيد.',
  'act.wallet.adminIssued':
    'كروت الشحن تصدرها الإدارة. لا يوجد دفع إلكتروني: يُضاف الرصيد فقط باستخدام كرت شحن، أو عن طريق الإدارة.',
  'act.wallet.totalRecharged': 'إجمالي المضاف',
  'act.wallet.totalSpent': 'إجمالي المصروف',
  'act.wallet.tx.CREDIT_RECHARGE': 'كرت شحن',
  'act.wallet.tx.PURCHASE': 'شراء',
  'act.wallet.tx.REFUND': 'استرداد',
  'act.wallet.tx.ADMIN_ADJUSTMENT': 'تعديل من الإدارة',
  'act.wallet.tx.REVERSAL': 'عكس عملية',
  'act.wallet.browseLibrary': 'تصفّح المكتبة',

  'act.mine.subtitle': 'كل ما تم تفعيله على حسابك. ذاكره من تطبيق Student Center.',
  'act.mine.courses': 'الكورسات',
  'act.mine.documents': 'مستندات المكتبة',
  'act.mine.full': 'الكورس كاملًا',
  'act.mine.partsOf': '{owned} من {total} أجزاء',
  'act.mine.partial': 'وصول جزئي',
  'act.mine.unlockMore': 'افتح المزيد',
  'act.mine.emptyCoursesTitle': 'لا توجد كورسات مفعّلة بعد',
  'act.mine.emptyCoursesBody': 'الكورسات التي تفعّلها ستظهر هنا.',
  'act.mine.emptyDocsTitle': 'لا توجد مستندات مكتبة بعد',
  'act.mine.emptyDocsBody': 'المستندات التي تشتريها ستظهر هنا.',
  'act.mine.browseCourses': 'تصفّح الكورسات',

  'act.account.title': 'حسابي',
  'act.account.signOutNote': 'تسجيل الخروج من هنا لا يسجّل خروجك من التطبيق.',
  'act.account.notDevice': 'هذه البوابة ليست جهاز تشغيل، ولا تستهلك عدد الأجهزة المسموح به لحسابك.',
  'act.account.preferences': 'التفضيلات',

  'act.notFound.title': 'الصفحة غير موجودة',
  'act.notFound.home': 'العودة إلى البوابة',
};

export const activationDictionaries: Record<Language, Record<ActivationKey, string>> = { en, ar };

/**
 * Portal words first, then the platform dictionary. A key in neither comes
 * back as the key itself, exactly as the platform's `translate` does.
 */
export function translateActivation(
  language: Language,
  key: string,
  params?: Record<string, string | number>,
): string {
  const own = (activationDictionaries[language] as Record<string, string>)[key] ?? (en as Record<string, string>)[key];
  if (own === undefined) return translate(language, key, params);

  let text = own;
  if (params) {
    for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, String(v));
  }
  return text;
}

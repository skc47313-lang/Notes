/* =====================================================================
   Notes Bazar - BSEB / SCERT Bihar chapter lists
   ---------------------------------------------------------------------
   Used by the AI Notes Maker and the AI Question Paper maker:
     1) the "Pick a chapter" dropdown shows these chapters
     2) the AI is told to make notes / questions ONLY from this book

   HOW TO ADD OR FIX A LIST (no other file needs to change):
     '<class>|<subject key>': {
         approx: true,                 // optional: shows "please check this list against your book"
         book: 'book name(s)',         // optional: told to the AI
         groups: [
             { g: 'Part / book heading', c: ['Chapter 1', 'Chapter 2'] },
             { g: 'Another part',        c: ['Chapter 1', 'Chapter 2'] }
         ]
     }
   Subject keys: sst, hindi, english, maithili, sanskrit, nonhindi ...
   (Science and Maths use the NCERT lists inside extras.js.)
   ===================================================================== */
window.NB_BSEB = {

    /* ---------------- Class 10 : Social Science (checked against the BSEB model paper pattern) ---------------- */
    '10|sst': {
        book: 'BSEB / SCERT Bihar Class 10 Social Science, made of five books: History (इतिहास), Geography (भूगोल), Political Science (राजनीति विज्ञान), Economics (अर्थशास्त्र) and Disaster Management (आपदा प्रबंधन)',
        groups: [
            { g: 'इतिहास (History)', c: [
                'यूरोप में राष्ट्रवाद (Nationalism in Europe)',
                'समाजवाद एवं साम्यवाद (Socialism and Communism)',
                'हिंद-चीन में राष्ट्रवादी आंदोलन (Nationalist Movement in Indo-China)',
                'भारत में राष्ट्रवाद (Nationalism in India)',
                'अर्थव्यवस्था और आजीविका (Economy and Livelihood)',
                'शहरीकरण एवं शहरी जीवन (Urbanisation and Urban Life)',
                'व्यापार और भूमंडलीकरण (Trade and Globalisation)',
                'प्रेस-संस्कृति एवं राष्ट्रवाद (Press, Culture and Nationalism)'
            ] },
            { g: 'भूगोल (Geography)', c: [
                'भारत: संसाधन एवं उपयोग – प्राकृतिक संसाधन',
                'भारत: संसाधन एवं उपयोग – जल संसाधन',
                'भारत: संसाधन एवं उपयोग – वन एवं वन्य प्राणी संसाधन',
                'भारत: संसाधन एवं उपयोग – खनिज संसाधन',
                'भारत: संसाधन एवं उपयोग – शक्ति (ऊर्जा) संसाधन',
                'कृषि (Agriculture)',
                'निर्माण उद्योग (Manufacturing Industries)',
                'परिवहन, संचार एवं व्यापार (Transport, Communication and Trade)',
                'बिहार: कृषि एवं वन संसाधन (Bihar: Agriculture and Forest Resources)',
                'मानचित्र अध्ययन (Map Study)'
            ] },
            { g: 'राजनीति विज्ञान (Political Science)', c: [
                'लोकतंत्र में सत्ता की साझेदारी (Power Sharing in Democracy)',
                'सत्ता में साझेदारी की कार्यप्रणाली (Working of Power Sharing)',
                'लोकतंत्र में प्रतिस्पर्धा एवं संघर्ष (Competition and Conflict in Democracy)',
                'लोकतंत्र की उपलब्धियाँ (Achievements of Democracy)',
                'लोकतंत्र की चुनौतियाँ (Challenges of Democracy)'
            ] },
            { g: 'अर्थशास्त्र (Economics)', c: [
                'अर्थव्यवस्था एवं इसके विकास का इतिहास (Economy and its Development)',
                'राज्य एवं राष्ट्र की आय (State and National Income)',
                'मुद्रा, बचत एवं साख (Money, Saving and Credit)',
                'हमारी वित्तीय संस्थाएँ (Our Financial Institutions)',
                'रोजगार एवं सेवाएँ (Employment and Services)',
                'वैश्वीकरण (Globalisation)',
                'उपभोक्ता जागरण एवं संरक्षण (Consumer Awareness and Protection)'
            ] },
            { g: 'आपदा प्रबंधन (Disaster Management)', c: [
                'प्राकृतिक आपदा: एक परिचय (Natural Disaster: An Introduction)',
                'प्राकृतिक आपदा एवं प्रबंधन: बाढ़ और सुखाड़ (Flood and Drought)',
                'प्राकृतिक आपदा एवं प्रबंधन: भूकंप एवं सुनामी (Earthquake and Tsunami)',
                'जीवन रक्षक आकस्मिक प्रबंधन (Life Saving Emergency Management)',
                'आपदा काल में वैकल्पिक संचार व्यवस्था (Alternative Communication in Disaster)',
                'आपदा और सह-अस्तित्व (Disaster and Co-existence)'
            ] }
        ]
    },

    /* ---------------- Class 9 : Social Science (topics from the BSEB Class 9 syllabus; Hindi names written by us, so please check) ---------------- */
    '9|sst': {
        approx: true,
        book: 'BSEB / SCERT Bihar Class 9 Social Science, made of five books: History (इतिहास), Geography (भूगोल), Political Science (राजनीति विज्ञान), Economics (अर्थशास्त्र) and Disaster Management (आपदा प्रबंधन)',
        groups: [
            { g: 'इतिहास (History)', c: [
                'भौगोलिक खोजें (Geographical Discoveries)',
                'औद्योगिक क्रांति (Industrial Revolution)',
                'फ्रांस की क्रांति (The Revolution in France)',
                'प्रथम विश्वयुद्ध (World War I)',
                'नात्सीवाद (Nazism)',
                'उपनिवेशवाद एवं प्रतिरोध आंदोलन (Colonialism and Resistance Movements)',
                'शांति के प्रयास (Efforts for Peace)',
                'कृषि एवं उद्योग (Agriculture and Industries)'
            ] },
            { g: 'भूगोल (Geography)', c: [
                'अवस्थिति एवं विस्तार (Location and Expansion)',
                'भौतिक पर्यावरण – संरचना एवं संसाधन (Physical Environment)',
                'भारत की प्रमुख नदियाँ – अपवाह तंत्र (Drainage System)',
                'जलवायु (Climate)',
                'प्राकृतिक वनस्पति एवं वन्य प्राणी (Natural Vegetation and Wildlife)',
                'जनसंख्या (Population)',
                'भारत की आर्थिक क्रियाएँ (Economic Activities)',
                'मानव संसाधन (Human Resources)',
                'भारत का प्रादेशिक अध्ययन (Regional Studies of India)'
            ] },
            { g: 'राजनीति विज्ञान (Political Science)', c: [
                'लोकतंत्र के विकास की कहानी (The Story of Democracy)',
                'लोकतंत्र क्या? लोकतंत्र क्यों? (What is Democracy? Why Democracy?)',
                'संविधान निर्माण (Constitution Making)',
                'चुनावी राजनीति (Electoral Politics)',
                'लोकतांत्रिक संस्थाओं का कार्यकरण (Working of Institutions)',
                'लोकतांत्रिक अधिकार (Democratic Rights)'
            ] },
            { g: 'अर्थशास्त्र (Economics)', c: [
                'बिहार के एक गाँव की कहानी (The Story of a Village in Bihar)',
                'मानव संसाधन (Humans as Resources)',
                'निर्धनता (Poverty)',
                'बेरोजगारी (Unemployment)',
                'कृषि, खाद्य सुरक्षा एवं गुणवत्ता (Agriculture, Food Security and Quality)',
                'आधारभूत संरचना (Infrastructure)'
            ] },
            { g: 'आपदा प्रबंधन (Disaster Management)', c: [
                'आपदा प्रबंधन: एक परिचय (Introduction to Disaster Management)',
                'मानवजनित आपदाएँ (Human-Induced Disasters)',
                'तकनीकी आपदाएँ (Technological Disasters)',
                'जैविक आपदाएँ (Biological Disasters)',
                'सामान्य आपदा निवारण एवं नियंत्रण (Common Disaster Prevention and Control)',
                'समुदाय आधारित आपदा प्रबंधन (Community-Based Disaster Management)'
            ] }
        ]
    },

    /* ---------------- Class 10 : Hindi (Godhuli Bhag-2). Written from memory, so please check against your book. ---------------- */
    '10|hindi': {
        approx: true,
        book: 'Godhuli Bhag-2 (गोधूलि भाग-2), the BSEB / SCERT Bihar Class 10 Hindi textbook, with its Gadya Khand and Padya Khand',
        groups: [
            { g: 'गद्य खंड', tp: 'गद्य खंड (गोधूलि भाग-2)', c: [
                'श्रम विभाजन और जाति प्रथा – भीमराव अंबेडकर',
                'विष के दाँत – नलिन विलोचन शर्मा',
                'भारत से हम क्या सीखें – मैक्स मूलर',
                'नाखून क्यों बढ़ते हैं – हजारीप्रसाद द्विवेदी',
                'नागरी लिपि – गुणाकर मुले',
                'बहादुर – अमरकांत',
                'परंपरा का मूल्यांकन – रामविलास शर्मा',
                'जित-जित मैं निरखत हूँ – बिरजू महाराज',
                'आविन्यों – अशोक वाजपेयी',
                'मछली – रामधारी सिंह दिवाकर',
                'नौबतखाने में इबादत – यतींद्र मिश्र',
                'शिक्षा और संस्कृति – महात्मा गांधी'
            ] },
            { g: 'पद्य खंड', tp: 'पद्य खंड (गोधूलि भाग-2)', c: [
                'राम बिनु बिरथे जगि जनमा / जो नर दुख में दुख नहिं मानै – गुरु नानक',
                'प्रेम-अयनि श्री राधिका / करील के कुंजन ऊपर वारौं – रसखान',
                'अति सूधो सनेह को मारग है / मो अँसुवानिहिं लै बरसो – घनानंद',
                'स्वदेशी – बदरीनारायण चौधरी प्रेमघन',
                'भारतमाता – सुमित्रानंदन पंत',
                'जनतंत्र का जन्म – रामधारी सिंह दिनकर',
                'हिरोशिमा – अज्ञेय',
                'एक वृक्ष की हत्या – कुँवर नारायण',
                'हमारी नींद – राजकमल चौधरी',
                'अक्षर-ज्ञान – अनामिका',
                'लौटकर आऊँगा फिर – जीवनानंद दास',
                'मेरे बिना तुम प्रभु – रेनर मारिया रिल्के'
            ] }
        ]
    }

    /* Add more lists here, for example:
    ,'8|sst': { groups: [ { g: 'इतिहास (अतीत से वर्तमान)', c: ['...'] } ] }
    ,'10|english': { book: 'Panorama Part-II', groups: [ { g: 'Prose', c: ['...'] } ] }
    ,'10|maithili': { groups: [ { g: 'गद्य', c: ['...'] } ] }
    */
};

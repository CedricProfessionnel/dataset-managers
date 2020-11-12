import CognitoDatasetManager from "../../../dist/CognitoDatasetManager.js";
import getAuthConfig from "./get-auth-config.js";
var obj = {"name":"New undefined Dataset","interface":{"type":"image_segmentation","labels":["valid","invalid"],"regionTypesAllowed":["bounding-box","polygon","point"]},"samples":[{"_id":"shcscmhiv","imageUrl":"https://fr.cdn.v5.futura-sciences.com/buildsv6/images/wide1920/0/0/d/00dd1479a5_108485_chat-domestique.jpg","annotation":[{"regionType":"bounding-box","id":"7676796589570372","centerX":0.39035591274397247,"centerY":0.48036739380022964,"width":0.09184845005740527,"height":0.10838117106773826,"color":"#ff0000"},{"regionType":"bounding-box","id":"7047613988829033","centerX":0.5964408725602756,"centerY":0.37841561423650977,"width":0.07003444316877161,"height":0.1102181400688863,"color":"#ff0000"}],"brush":"complete"},{"_id":"sdjz2g1qa","imageUrl":"https://www.filalapat.fr/sites/default/files/2020-02/age_chat.jpg"}]};

describe("Cognito Server Tests", () => {
  it("Create the CognitoDatasetManager object", () => {
    cy.wrap(null).then(async () => {
      const authConfig = getAuthConfig();

      const dummyUser = {
        username: Cypress.env().COGNITO_USER_NAME,
        password: Cypress.env().COGNITO_USER_PASS,
      };

      const dm = new CognitoDatasetManager({ authConfig, dummyUser });

      cy.log("Test fonction isReady");
      expect(await dm.isReady()).to.equal(true);

      var list = await dm.getProjects();
      var exist = false;
      for(var i=0;i<list.length;i++){
        if(list[i].key =="TestCypherProject/" ){
          exist=true;
        }
      }
      cy.log("Test getList")
      //expect(exist).to.equal(true);

      dm.setProject("imageProject");

      cy.log(await dm.getSummary());
    });
  });
});

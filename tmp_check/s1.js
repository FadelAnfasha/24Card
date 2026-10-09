
// support ?only=N for single-frame rendering (screenshots / sharing)
(function(){
  var q=new URLSearchParams(location.search);
  var only=q.get('only');
  if(only){
    document.querySelectorAll('.board .slot').forEach(function(s,i){
      if(String(i+1)!==only){s.style.display='none';}
      else{s.querySelector('.phone').style.margin='0 auto';}
    });
    var n=document.querySelector('.note'); if(n){n.style.display='none';}
    document.querySelector('header .flow').style.display='none';
    document.body.style.padding='20px';
  }
})();

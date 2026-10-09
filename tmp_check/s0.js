
(function(){
  var CARDS=[{id:0,v:6,s:'♥',red:true},{id:1,v:4,s:'♠',red:false},{id:2,v:3,s:'♦',red:true},{id:3,v:2,s:'♣',red:false}];
  var tray=document.getElementById('tray');
  var strip=document.getElementById('strip');
  var ops=document.getElementById('ops');
  var checks=document.getElementById('checks');
  var btn=document.getElementById('proveBtn');
  var undo=document.getElementById('undoBtn');
  var suppressClick=false;
  // prefill contoh valid: 6 × 4 ÷ ( 3 − 2 )
  var state=[{k:'c',i:0},{k:'o',ch:'×'},{k:'c',i:1},{k:'o',ch:'÷'},{k:'o',ch:'('},{k:'c',i:2},{k:'o',ch:'−'},{k:'c',i:3},{k:'o',ch:')'}];

  function cardById(id){for(var j=0;j<CARDS.length;j++){if(CARDS[j].id===id)return CARDS[j];}return null;}

  function renderTray(){
    tray.innerHTML='';
    var placed=state.filter(function(t){return t.k==='c';}).map(function(t){return t.i;});
    var left=CARDS.filter(function(c){return placed.indexOf(c.id)<0;});
    if(!left.length){tray.innerHTML='<span class="mini">semua kartu sudah di strip — tap token di strip untuk mengembalikannya</span>';return;}
    left.forEach(function(c){
      var el=document.createElement('div');
      el.className='pcard'+(c.red?' red':'');
      el.innerHTML='<span class="v">'+c.v+'</span><span class="s">'+c.s+'</span>';
      el.dataset.id=c.id;
      tray.appendChild(el);
    });
  }

  function renderStrip(){
    strip.innerHTML='';
    if(!state.length){strip.innerHTML='<span class="ph">geser / tap kartu ke sini…</span>';return;}
    state.forEach(function(t,idx){
      var el=document.createElement('div');
      if(t.k==='c'){
        var c=cardById(t.i);
        el.className='tokc'+(c.red?' red':'');
        el.innerHTML=c.v+'<i>'+c.s+'</i>';
        el.title='tap untuk kembalikan ke tray';
      }else{
        el.className='toko';
        el.textContent=t.ch;
        el.title='tap untuk hapus';
      }
      el.addEventListener('click',function(){state.splice(idx,1);update();});
      strip.appendChild(el);
    });
  }

  function addCard(id){
    var used=state.some(function(t){return t.k==='c'&&t.i===id;});
    if(used)return;
    state.push({k:'c',i:id});update();
  }

  function parseEval(tokens){
    var i=0;
    function peek(){return tokens[i];}
    function expr(){
      var v=term();
      while(peek()==='+'||peek()==='-'){var op=tokens[i++];var r=term();v=op==='+'?v+r:v-r;}
      return v;
    }
    function term(){
      var v=factor();
      while(peek()==='*'||peek()==='/'){
        var op=tokens[i++];var r=factor();
        if(op==='*'){v=v*r;}
        else{if(r===0||v%r!==0)throw 'div';v=v/r;}
      }
      return v;
    }
    function factor(){
      var t=peek();
      if(t===undefined)throw 'syntax';
      if(t==='('){i++;var v=expr();if(peek()!==')')throw 'syntax';i++;return v;}
      if(typeof t==='number'){i++;return t;}
      throw 'syntax';
    }
    var out=expr();
    if(i!==tokens.length)throw 'syntax';
    return out;
  }

  function tokenize(str){
    var toks=[],nums=[],m=str.match(/[0-9]+|[+\-*/()]/g);
    if(!m)return null;
    if(m.join('').replace(/\s/g,'')!==str.replace(/\s/g,''))return null;
    for(var k=0;k<m.length;k++){
      var t=m[k];
      if(/^[0-9]+$/.test(t)){var n=parseInt(t,10);toks.push(n);nums.push(n);}
      else toks.push(t);
    }
    return {toks:toks,nums:nums};
  }

  function stat(ok,txt){return '<div class="stat '+(ok?'ok':'no')+'"><span class="tick">'+(ok?'✓':'✕')+'</span> '+txt+'</div>';}

  function validate(){
    var placedCards=state.filter(function(t){return t.k==='c';}).length;
    if(!state.length){
      checks.innerHTML=stat(true,'Ekspresi valid')+stat(true,'Ke-4 kartu dipakai tepat 1×')+stat(true,'Semua pembagian bulat')+stat(true,'Hasil = 24');
      btn.classList.remove('btn-danger');btn.classList.add('btn-gold');btn.textContent='KIRIM BUKTI';
      return;
    }
    var wire=state.map(function(t){
      if(t.k==='c')return String(cardById(t.i).v);
      return t.ch.replace('×','*').replace('÷','/').replace('−','-');
    }).join('');
    var cardsOk=placedCards===4;
    var result=null,err=null,tk=tokenize(wire);
    if(!tk){err='syntax';}
    else{try{result=parseEval(tk.toks);}catch(e){err=e;}}
    var c1=stat(true,'Ekspresi tersusun');
    var c2=stat(cardsOk,cardsOk?'Ke-4 kartu dipakai tepat 1×':'Kartu belum semua dipakai ('+placedCards+'/4)');
    if(err==='div'){checks.innerHTML=c1+c2+stat(false,'Pembagian harus bilangan bulat');}
    else if(err){checks.innerHTML=c1+c2+stat(false,'Urutan ekspresi belum valid');}
    else{
      var okRes=result===24;
      checks.innerHTML=c1+c2+stat(true,'Semua pembagian bulat')+stat(okRes,okRes?'Hasil = 24':'Hasil = '+result+' (bukan 24)');
    }
    var allOk=checks.querySelectorAll('.stat.no').length===0;
    btn.classList.toggle('btn-gold',allOk);
    btn.classList.toggle('btn-danger',!allOk);
    btn.textContent=allOk?'KIRIM BUKTI':'BELUM VALID';
  }

  function update(){renderStrip();renderTray();validate();}

  ops.addEventListener('click',function(e){
    var b=e.target.closest('.opb');
    if(!b||b.id==='undoBtn')return;
    state.push({k:'o',ch:b.dataset.op});update();
  });
  undo.addEventListener('click',function(){state.pop();update();});
  tray.addEventListener('click',function(e){
    if(suppressClick)return;
    var el=e.target.closest('.pcard');
    if(!el)return;
    addCard(+el.dataset.id);
  });

  // pointer drag: tray → strip (works on touch & mouse)
  var ghost=null;
  tray.addEventListener('pointerdown',function(e){
    var el=e.target.closest('.pcard');
    if(!el)return;
    var id=+el.dataset.id,moved=false,sx=e.clientX,sy=e.clientY;
    ghost=el.cloneNode(true);
    ghost.className+=' ghostdrag';
    ghost.style.width=el.offsetWidth+'px';
    document.body.appendChild(ghost);
    function mv(ev){
      if(Math.abs(ev.clientX-sx)>8||Math.abs(ev.clientY-sy)>8)moved=true;
      if(!ghost)return;
      ghost.style.left=(ev.clientX-30)+'px';
      ghost.style.top=(ev.clientY-43)+'px';
      var r=strip.getBoundingClientRect();
      strip.classList.toggle('hot',ev.clientX>=r.left-40&&ev.clientX<=r.right+40&&ev.clientY>=r.top-40&&ev.clientY<=r.bottom+40);
    }
    function up(ev){
      document.removeEventListener('pointermove',mv);
      document.removeEventListener('pointerup',up);
      if(ghost){ghost.remove();ghost=null;}
      strip.classList.remove('hot');
      if(moved){
        suppressClick=true;
        setTimeout(function(){suppressClick=false;},160);
        var r=strip.getBoundingClientRect();
        if(ev.clientX>=r.left-40&&ev.clientX<=r.right+40&&ev.clientY>=r.top-40&&ev.clientY<=r.bottom+40){addCard(id);}
      }
    }
    mv(e);
    document.addEventListener('pointermove',mv);
    document.addEventListener('pointerup',up);
  });

  btn.addEventListener('click',function(){
    if(btn.classList.contains('btn-gold')){
      btn.textContent='✓ BUKTI TERKIRIM';
      setTimeout(function(){btn.textContent='KIRIM BUKTI';},1400);
    }
  });

  update();
})();
